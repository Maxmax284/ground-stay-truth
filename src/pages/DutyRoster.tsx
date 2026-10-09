import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Copy, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCampShort, toCampInputValue, fromCampInputValue } from "@/lib/timezone";

const NONE = "__none__";
const DAY = 864e5;
type Shift = { id: string; starts_at: string; ends_at: string; primary_user_id: string; backup_user_id: string | null; note: string | null };
type Draft = { id?: string; start: string; end: string; pri: string; bak: string; note: string };
const blank: Draft = { start: "", end: "", pri: NONE, bak: NONE, note: "" };

/** Duty roster: management-approved shifts, responders and coverage windows. Never auto-assigns. */
export default function DutyRoster() {
  const { role, user } = useAuth();
  const canManage = role === "admin" || role === "manager";
  const qc = useQueryClient();
  const [days, setDays] = useState(14);
  const [draft, setDraft] = useState<Draft | null>(null);

  const refresh = () => ["duty-roster-page", "duty-roster", "responders", "coverage-now"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const { data: staff } = useQuery({
    queryKey: ["coverage-staff"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "guest");
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids) : { data: [] as any[] };
      return ids.map((id) => {
        const p = (profs ?? []).find((x: any) => x.user_id === id);
        return { id, name: p?.full_name || p?.email || id.slice(0, 8) };
      });
    },
  });
  const { data: responders } = useQuery({
    queryKey: ["responders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("responder_capabilities").select("*");
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: roster } = useQuery({
    queryKey: ["duty-roster-page", days],
    queryFn: async () => {
      const now = Date.now();
      const { data, error } = await (supabase as any).from("duty_roster").select("*")
        .gte("ends_at", new Date(now - DAY).toISOString())
        .lte("starts_at", new Date(now + days * DAY).toISOString())
        .order("starts_at");
      if (error) throw error;
      return data as Shift[];
    },
  });

  const nameOf = useMemo(() => (id?: string | null) => (id ? staff?.find((s) => s.id === id)?.name ?? "Unknown" : "—"), [staff]);
  const onSite = (id?: string | null) => !!responders?.find((r) => r.user_id === id)?.can_assist_on_site;
  const alertable = (responders ?? []).filter((r) => r.can_receive_alerts);

  // Coverage gaps across the window (from now to end of window)
  const gaps = useMemo(() => {
    const out: { from: number; to: number }[] = [];
    let cursor = Date.now();
    const end = Date.now() + days * DAY;
    for (const s of [...(roster ?? [])].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))) {
      const st = +new Date(s.starts_at), en = +new Date(s.ends_at);
      if (en <= cursor) continue;
      if (st > cursor) out.push({ from: cursor, to: Math.min(st, end) });
      cursor = Math.max(cursor, en);
    }
    if (cursor < end) out.push({ from: cursor, to: end });
    return out.filter((g) => g.to - g.from >= 15 * 60e3);
  }, [roster, days]);

  // Group by Bangkok day
  const byDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of roster ?? []) {
      const k = toCampInputValue(s.starts_at).slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [roster]);

  const saveShift = useMutation({
    mutationFn: async (d: Draft) => {
      const row = {
        starts_at: fromCampInputValue(d.start), ends_at: fromCampInputValue(d.end),
        primary_user_id: d.pri, backup_user_id: d.bak === NONE ? null : d.bak,
        note: d.note.trim() || null, approved_by: user!.id, approved_at: new Date().toISOString(),
      };
      if (+new Date(row.ends_at!) <= +new Date(row.starts_at!)) throw new Error("Shift must end after it starts.");
      const q = d.id ? (supabase as any).from("duty_roster").update(row).eq("id", d.id) : (supabase as any).from("duty_roster").insert(row);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Shift approved"); setDraft(null); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeShift = async (id: string) => {
    if (!confirm("Remove this shift?")) return;
    const { error } = await (supabase as any).from("duty_roster").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const duplicateNextDay = (s: Shift) => setDraft({
    start: toCampInputValue(new Date(+new Date(s.starts_at) + DAY)), end: toCampInputValue(new Date(+new Date(s.ends_at) + DAY)),
    pri: s.primary_user_id, bak: s.backup_user_id ?? NONE, note: s.note ?? "",
  });

  // Responders
  const [rUser, setRUser] = useState(NONE);
  const upsertResponder = async (user_id: string, patch: { can_receive_alerts?: boolean; can_assist_on_site?: boolean }, existing?: any) => {
    const db = (supabase as any).from("responder_capabilities");
    // Toggles update the existing row by id; only brand-new approvals insert.
    const { error } = existing?.id
      ? await db.update(patch).eq("id", existing.id)
      : await db.upsert({
          user_id, property_id: null,
          can_receive_alerts: patch.can_receive_alerts ?? true,
          can_assist_on_site: patch.can_assist_on_site ?? false,
          approved_by: user!.id, approved_at: new Date().toISOString(),
        }, { onConflict: "user_id,property_id" });
    if (error) toast.error(error.message); else refresh();
  };
  const removeResponder = async (id: string) => {
    if (!confirm("Remove this responder? Their future shifts stay but will need review.")) return;
    const { error } = await (supabase as any).from("responder_capabilities").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/front-desk?tab=duty"><ArrowLeft className="h-4 w-4 mr-1" />Front Desk</Link></Button>
          <h1 className="text-xl font-semibold">Duty roster</h1>
          <span className="text-xs text-muted-foreground">Bangkok time · management-approved only</span>
          <div className="ml-auto flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{[7, 14, 30].map((d) => <SelectItem key={d} value={String(d)}>Next {d} days</SelectItem>)}</SelectContent>
            </Select>
            {canManage && <Button size="sm" onClick={() => setDraft(blank)} disabled={alertable.length === 0}><Plus className="h-4 w-4 mr-1" />Add shift</Button>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Nobody is put on duty automatically. A sent alert doesn't mean someone is available, and the guest is never promised 24/7 help.</p>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Coverage gaps</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {gaps.length === 0 ? <p className="text-xs text-muted-foreground">No gaps in this window.</p> : gaps.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs">
                    <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <span className="font-stat">{formatCampShort(new Date(g.from))} → {formatCampShort(new Date(g.to))}</span>
                    <span className="text-muted-foreground">urgent requests go to managers &amp; admins</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Shifts</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                {byDay.length === 0 && <p className="text-xs text-muted-foreground">No approved shifts in this window.</p>}
                {byDay.map(([day, shifts]) => (
                  <div key={day} className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    {shifts.map((s) => {
                      const live = Date.now() >= +new Date(s.starts_at) && Date.now() < +new Date(s.ends_at);
                      const noOnSite = !onSite(s.primary_user_id) && !onSite(s.backup_user_id);
                      return (
                        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs">
                          <span className="font-stat">{formatCampShort(s.starts_at)} → {formatCampShort(s.ends_at)}</span>
                          {live && <Badge>on now</Badge>}
                          <Badge variant="secondary">{nameOf(s.primary_user_id)}</Badge>
                          {s.backup_user_id ? <Badge variant="outline">backup {nameOf(s.backup_user_id)}</Badge> : <span className="text-muted-foreground">no backup</span>}
                          {noOnSite && <span className="text-destructive">nobody on site</span>}
                          {s.note && <span className="w-full text-muted-foreground">{s.note}</span>}
                          {canManage && (
                            <div className="ml-auto flex gap-0.5">
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit shift" onClick={() => setDraft({ id: s.id, start: toCampInputValue(s.starts_at), end: toCampInputValue(s.ends_at), pri: s.primary_user_id, bak: s.backup_user_id ?? NONE, note: s.note ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Copy to next day" onClick={() => duplicateNextDay(s)}><Copy className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove shift" onClick={() => removeShift(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader className="pb-2"><CardTitle className="text-base">Approved responders</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(responders ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nobody approved yet. Shifts need approved responders.</p>}
              {(responders ?? []).map((r) => (
                <div key={r.id} className="space-y-1.5 rounded-md border border-border p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs">{nameOf(r.user_id)}</span>
                    {canManage && <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" aria-label="Remove responder" onClick={() => removeResponder(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                  <label className="flex items-center justify-between text-xs">Can be notified
                    <Switch disabled={!canManage} checked={r.can_receive_alerts} onCheckedChange={(v) => upsertResponder(r.user_id, { can_receive_alerts: v }, r)} /></label>
                  <label className="flex items-center justify-between text-xs">Can assist on site
                    <Switch disabled={!canManage} checked={r.can_assist_on_site} onCheckedChange={(v) => upsertResponder(r.user_id, { can_assist_on_site: v }, r)} /></label>
                </div>
              ))}
              {canManage && (
                <div className="flex gap-2">
                  <Select value={rUser} onValueChange={setRUser}>
                    <SelectTrigger><SelectValue placeholder="Staff member" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} disabled>Staff member</SelectItem>
                      {(staff ?? []).filter((s) => !responders?.some((r) => r.user_id === s.id)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={rUser === NONE} onClick={() => { upsertResponder(rUser, {}); setRUser(NONE); }}>Approve</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? "Edit shift" : "New shift"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs space-y-1">Starts (Bangkok)<Input type="datetime-local" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
              <label className="text-xs space-y-1">Ends (Bangkok)<Input type="datetime-local" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
              <Select value={draft.pri} onValueChange={(v) => setDraft({ ...draft, pri: v })}>
                <SelectTrigger><SelectValue placeholder="Primary" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} disabled>Primary</SelectItem>
                  {alertable.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{nameOf(r.user_id)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={draft.bak} onValueChange={(v) => setDraft({ ...draft, bak: v })}>
                <SelectTrigger><SelectValue placeholder="Backup" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No backup</SelectItem>
                  {alertable.filter((r) => r.user_id !== draft.pri).map((r) => <SelectItem key={r.user_id} value={r.user_id}>{nameOf(r.user_id)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="sm:col-span-2" placeholder="Note (optional)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button disabled={!draft?.start || !draft?.end || draft?.pri === NONE || saveShift.isPending} onClick={() => draft && saveShift.mutate(draft)}>Approve shift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
