import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCampShort, toCampInputValue, fromCampInputValue } from "@/lib/timezone";
import { useSetAssistanceSetting, useAssistanceConfig } from "@/hooks/useUrgentAssistance";
import { Link } from "react-router-dom";
import { toWaLink } from "@/lib/contactLinks";
import { MyAlertEmail } from "./MyAlertEmail";

const copyText = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"));

type Coverage = {
  shift_id: string | null; starts_at: string | null; ends_at: string | null;
  primary_user_id: string | null; backup_user_id: string | null;
  primary_on_site: boolean | null; backup_on_site: boolean | null;
  gap: boolean; auto_escalation_enabled: boolean;
};

const NONE = "__none__";

/** Coverage & escalation: who's on now, the approved roster, approved responders, escalation settings. */
export function CoveragePanel({ mode = "status" }: { mode?: "status" | "settings" }) {
  const { role, user } = useAuth();
  const isSettings = mode === "settings";
  const canManage = role === "admin" || role === "manager";
  // Managers/admins get the full setup on Front Desk too; others see status only.
  const showSetup = isSettings || canManage;
  const qc = useQueryClient();
  const setSetting = useSetAssistanceSetting();
  const { data: cfg } = useAssistanceConfig();

  const { data: coverage } = useQuery({
    queryKey: ["coverage-now"], refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_current_coverage" as any);
      if (error) throw error;
      return data as unknown as Coverage;
    },
  });
  const { data: esc } = useQuery({
    queryKey: ["escalation-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_escalation_settings" as any);
      if (error) throw error;
      return data as any;
    },
  });
  const { data: staff } = useQuery({
    queryKey: ["coverage-staff"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "guest");
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids)
        : { data: [] as any[] };
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
    queryKey: ["duty-roster"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("duty_roster").select("*")
        .gte("ends_at", new Date().toISOString())
        .lte("starts_at", new Date(Date.now() + 7 * 864e5).toISOString())
        .order("starts_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const nameOf = useMemo(() => (id?: string | null) => (id ? staff?.find((s) => s.id === id)?.name ?? "Unknown" : "—"), [staff]);
  const refresh = () => ["coverage-now", "duty-roster", "responders", "escalation-settings"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  // Responder form
  const [rUser, setRUser] = useState(NONE);
  const [rOnSite, setROnSite] = useState(false);
  const addResponder = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("responder_capabilities").upsert(
        { user_id: rUser, property_id: null, can_receive_alerts: true, can_assist_on_site: rOnSite, approved_by: user!.id, approved_at: new Date().toISOString() },
        { onConflict: "user_id,property_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Responder approved"); setRUser(NONE); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeResponder = async (id: string) => {
    const { error } = await (supabase as any).from("responder_capabilities").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };

  // Shift form
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [pri, setPri] = useState(NONE); const [bak, setBak] = useState(NONE);
  const addShift = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("duty_roster").insert({
        starts_at: fromCampInputValue(start), ends_at: fromCampInputValue(end),
        primary_user_id: pri, backup_user_id: bak === NONE ? null : bak, approved_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Shift approved and added"); setStart(""); setEnd(""); setPri(NONE); setBak(NONE); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeShift = async (id: string) => {
    const { error } = await (supabase as any).from("duty_roster").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };

  // Escalation minutes
  const [mins, setMins] = useState({ b: "10", m: "20", r: "30" });
  useEffect(() => {
    if (esc) setMins({ b: String(esc.escalation_backup_minutes), m: String(esc.escalation_managers_minutes), r: String(esc.escalation_reminder_minutes) });
  }, [esc]);
  const saveSetting = async (key: string, value: unknown) => {
    try { await setSetting.mutateAsync({ key, value }); toast.success("Saved"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  const responderUsers = (responders ?? []).filter((r) => r.can_receive_alerts);
  const onSiteGap = coverage && !coverage.gap && !coverage.primary_on_site && !coverage.backup_on_site;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{isSettings ? "Coverage & escalation setup" : "Who's on duty"}</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isSettings && <MyAlertEmail />}
        {/* Now */}
        {coverage && (coverage.gap ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p><span className="font-semibold">Coverage gap.</span> No approved shift right now. Urgent requests go straight to managers and admins.</p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-border p-2.5">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))] shrink-0 mt-0.5" />
            <div>
              <p>On duty: <span className="font-semibold">{nameOf(coverage.primary_user_id)}</span>
                {coverage.backup_user_id && <> · backup <span className="font-semibold">{nameOf(coverage.backup_user_id)}</span></>}</p>
              <p className="text-xs text-muted-foreground">Until {formatCampShort(coverage.ends_at)} (Bangkok)</p>
              {onSiteGap && <p className="text-xs text-destructive mt-1">Nobody on this shift is marked as able to assist on site.</p>}
            </div>
          </div>
        ))}
        {coverage && (coverage as any).source === "default" && (
          <p className="text-[11px] text-muted-foreground -mt-2">No shift right now — using the Default On-Call set by management.</p>
        )}
        <p className="text-[11px] text-muted-foreground">A sent alert doesn't mean someone is available. Phone alerts only work on phones that have turned them on. Checked every 5 minutes, so alerts can land up to ~5 minutes after a threshold. Delivery has not yet been proven in a practice run.</p>

        {!isSettings && (role === "admin" || role === "manager") && (
          <div className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">Escalation setup, responders, your alert email and the practice drill live in <Link className="underline text-primary" to="/settings?tab=app">Settings → App</Link>.</div>
        )}
        {/* Guest contact (read-only here) */}
        {!isSettings && <div className="rounded-md border border-border p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">Guest contact</p>
            {canManage && <Button asChild size="sm" variant="ghost"><Link to="/settings?tab=app">Edit in Settings →</Link></Button>}
          </div>
          <p className="text-xs">Call camp: <span className="font-semibold">{cfg?.urgent_call_number || "not set"}</span></p>
          <p className="text-xs">WhatsApp: <span className="font-semibold">{cfg?.whatsapp_display_number || "not set"}</span></p>
          {toWaLink(cfg?.whatsapp_display_number) && (
            <button className="text-[11px] text-primary underline break-all text-left" onClick={() => copyText(toWaLink(cfg?.whatsapp_display_number)!)}>
              {toWaLink(cfg?.whatsapp_display_number)} (copy)
            </button>
          )}
          <p className="text-[11px] text-muted-foreground">WhatsApp and calls go straight to that phone — they don't create a CampStay request or alert the roster.</p>
        </div>}

        {isSettings && <>
        {/* Default on-call */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <p className="font-medium">Default On-Call (optional)</p>
          <p className="text-[11px] text-muted-foreground">Used only when no approved shift is on. Shifts always win. Blank = nobody.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([["default_oncall_primary", "Primary", (coverage as any)?.default_primary_user_id], ["default_oncall_backup", "Backup", (coverage as any)?.default_backup_user_id]] as const).map(([key, lbl, val]) => (
              <div key={key} className="space-y-1">
                <label className="text-[11px] text-muted-foreground">{lbl}</label>
                <Select disabled={!canManage} value={val || NONE} onValueChange={(v) => saveSetting(key, v === NONE ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nobody</SelectItem>
                    {responderUsers.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{nameOf(r.user_id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        {/* Escalation switch */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">Automatic escalation</p>
              <p className="text-[11px] text-muted-foreground">Off by default. Re-alerts only — never closes or reassigns anything.</p>
            </div>
            <Switch disabled={!canManage} checked={!!esc?.auto_escalation_enabled} onCheckedChange={(v) => saveSetting("auto_escalation_enabled", v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([["b", "escalation_backup_minutes", "To backup after (min)"], ["m", "escalation_managers_minutes", "To managers after (min)"], ["r", "escalation_reminder_minutes", "Open reminder every (min)"]] as const).map(([k, key, lbl]) => (
              <div key={k} className="space-y-1">
                <label className="text-[11px] text-muted-foreground">{lbl}</label>
                <div className="flex gap-1">
                  <Input type="number" min={1} max={240} disabled={!canManage} value={mins[k]} onChange={(e) => setMins((m) => ({ ...m, [k]: e.target.value }))} />
                  {canManage && <Button size="sm" variant="outline" onClick={() => saveSetting(key, Math.max(1, Math.min(240, Number(mins[k]) || 1)))}>Save</Button>}
                </div>
              </div>
            ))}
          </div>
          {canManage && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
              <p className="text-[11px] text-muted-foreground">Practice drill: emails a [PRACTICE DRILL] alert to you only. No guest, no incident, camp inbox untouched.</p>
              <Button size="sm" variant="outline" onClick={async () => {
                const { data, error } = await supabase.functions.invoke("practice-drill", { body: {} });
                let err = (data as any)?.error ?? null; if (error) { try { err = (await (error as any).context?.json())?.error ?? "send_failed"; } catch { err = "send_failed"; } }
                if (err === "not_approved_responder") return toast.error("Add yourself as an approved responder with “Can be notified” first.");
                if (err) return toast.error("Drill didn't send. Try again or check Operations Monitor.");
                if ((data as any)?.email_sent > 0) toast.success("Drill sent — check your inbox.");
                else toast.error("Drill ran but no email went out — check your saved alert email.");
              }}>Send practice drill</Button>
            </div>
          )}
        </div>

        </>}
        {/* Roster */}
        <div className="space-y-2">
          <p className="font-medium">Next 7 days</p>
          {(roster ?? []).length === 0 && <p className="text-xs text-muted-foreground">No approved shifts.</p>}
          {(roster ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs border-b border-border pb-1.5">
              <span className="font-stat">{formatCampShort(s.starts_at)} → {formatCampShort(s.ends_at)}</span>
              <Badge variant="secondary">{nameOf(s.primary_user_id)}</Badge>
              {s.backup_user_id && <Badge variant="outline">backup {nameOf(s.backup_user_id)}</Badge>}
              {canManage && <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" onClick={() => removeShift(s.id)} aria-label="Remove shift"><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          ))}
          {canManage && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Shift start (Bangkok)" />
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Shift end (Bangkok)" />
              <Select value={pri} onValueChange={setPri}>
                <SelectTrigger><SelectValue placeholder="Primary" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} disabled>Primary</SelectItem>
                  {responderUsers.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{nameOf(r.user_id)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={bak} onValueChange={setBak}>
                <SelectTrigger><SelectValue placeholder="Backup (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No backup</SelectItem>
                  {responderUsers.filter((r) => r.user_id !== pri).map((r) => <SelectItem key={r.user_id} value={r.user_id}>{nameOf(r.user_id)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="sm:col-span-2" disabled={!start || !end || pri === NONE || addShift.isPending} onClick={() => addShift.mutate()}>
                Approve &amp; add shift
              </Button>
            </div>
          )}
        </div>

        {/* Responders */}
        {isSettings && <div className="space-y-2">
          <p className="font-medium">Approved responders</p>
          {(responders ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nobody approved yet. Shifts need approved responders.</p>}
          {(responders ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{nameOf(r.user_id)}</span>
              <Badge variant="outline">gets alerts</Badge>
              {r.can_assist_on_site ? <Badge variant="secondary">can assist on site</Badge> : <Badge variant="outline">alerts only</Badge>}
              {canManage && <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" onClick={() => removeResponder(r.id)} aria-label="Remove responder"><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          ))}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={rUser} onValueChange={setRUser}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Staff member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} disabled>Staff member</SelectItem>
                  {(staff ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs"><Switch checked={rOnSite} onCheckedChange={setROnSite} /> Can assist on site</label>
              <Button size="sm" disabled={rUser === NONE || addResponder.isPending} onClick={() => addResponder.mutate()}>Approve</Button>
            </div>
          )}
        </div>}
      </CardContent>
    </Card>
  );
}
