import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStaffPhones, formatStaffPhone, normalizePhone } from "@/hooks/useStaffPhones";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";

const NONE = "__none__";

/**
 * The camp's phone directory. Managers and admins register every number the
 * camp texts from, so a reply from that number reads as staff in the thread
 * instead of an unknown guest. Identity only — nothing here moves a booking.
 */
export default function StaffPhoneManager() {
  const { role } = useAuth();
  const { phones, addPhone, updatePhone, removePhone, findDuplicate } = useStaffPhones();
  const { roles } = useUserRoles();

  const canEdit = role === "admin" || role === "manager";

  const [raw, setRaw] = useState("");
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState<string>(NONE);
  const [channel, setChannel] = useState("both");
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const staffOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of roles.data ?? []) {
      if (r.role === "guest") continue;
      if (!seen.has(r.user_id)) {
        seen.set(r.user_id, r.profile_name || r.profile_email || r.user_id.slice(0, 8));
      }
    }
    return [...seen.entries()].map(([user_id, name]) => ({ user_id, name }));
  }, [roles.data]);

  const e164 = normalizePhone(raw);
  const validShape = !!e164 && /^\+[1-9][0-9]{6,17}$/.test(e164);

  const handleBlurCheck = async () => {
    setDupWarning(null);
    if (!validShape) return;
    setChecking(true);
    const dup = await findDuplicate(raw);
    setChecking(false);
    if (dup) {
      setDupWarning(
        dup.where === "directory"
          ? `Already on the list as "${dup.label}" — no need to add it twice.`
          : `Already saved on ${dup.label}'s own profile.`,
      );
    }
  };

  const handleAdd = () => {
    addPhone.mutate(
      { phone_raw: raw, label: label.trim(), user_id: owner === NONE ? null : owner, channel },
      {
        onSuccess: () => {
          setRaw("");
          setLabel("");
          setOwner(NONE);
          setChannel("both");
          setDupWarning(null);
        },
      },
    );
  };

  const nameFor = (userId: string | null) =>
    userId ? staffOptions.find((s) => s.user_id === userId)?.name ?? "Staff member" : null;

  return (
    <div className="space-y-4">
      {/* Plain-English explainer — this is the part people get wrong. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            What this list is for
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Every mobile the camp writes to guests from goes on this list — the front desk phone,
            the duty manager, Nikki's WhatsApp, the driver dispatch line.
          </p>
          <p className="text-foreground">
            Once a number is here, anything sent from it shows up in the guest's conversation
            marked <span className="font-medium">Staff</span>, with the name of the line. Numbers
            that are not on this list land as an unknown sender.
          </p>
          <p>Only managers and admins can change this list. The same number cannot be added twice.</p>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Add a camp number</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="staff-phone-number">
                  Phone number <span className="text-muted-foreground">(with country code)</span>
                </Label>
                <Input
                  id="staff-phone-number"
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setDupWarning(null);
                  }}
                  onBlur={handleBlurCheck}
                  placeholder="+66 81 234 5678"
                  inputMode="tel"
                />
                {raw && !validShape && (
                  <p className="text-xs text-destructive">
                    Start with the country code, like +66 for Thailand or +33 for France.
                  </p>
                )}
                {validShape && !dupWarning && !checking && (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    Will be saved as {formatStaffPhone(raw)}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-phone-label">Which line is this?</Label>
                <Input
                  id="staff-phone-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Front Desk mobile"
                />
                <p className="text-xs text-muted-foreground">
                  Guests never see this. Staff see it next to the message.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Belongs to (optional)</Label>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger><SelectValue placeholder="Shared camp line" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Shared camp line — no one person</SelectItem>
                    {staffOptions.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Used for</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">WhatsApp and texts</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp only</SelectItem>
                    <SelectItem value="sms">Texts only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {dupWarning && (
              <div className="flex items-start gap-2 rounded-md bg-warning/10 p-2.5 text-sm text-warning-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{dupWarning}</span>
              </div>
            )}

            <Button
              onClick={handleAdd}
              disabled={!validShape || !label.trim() || !!dupWarning || addPhone.isPending}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              {addPhone.isPending ? "Saving…" : "Save this number"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            Numbers the camp answers from{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({(phones.data ?? []).length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {phones.isLoading ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
          ) : !(phones.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">
              No camp numbers saved yet. Add the front desk mobile first.
            </p>
          ) : (
            (phones.data ?? []).map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {p.label}
                    {nameFor(p.user_id) && (
                      <span className="text-muted-foreground font-normal"> · {nameFor(p.user_id)}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatStaffPhone(p.phone_e164)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    {p.channel === "both" ? "WhatsApp + texts" : p.channel === "whatsapp" ? "WhatsApp" : "Texts"}
                  </Badge>
                  {canEdit ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={p.is_active}
                          onCheckedChange={(v) => updatePhone.mutate({ id: p.id, is_active: v })}
                          aria-label="Active"
                        />
                        <span className="text-xs text-muted-foreground">
                          {p.is_active ? "In use" : "Off"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePhone.mutate(p.id)}
                        aria-label={`Remove ${p.label}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant={p.is_active ? "outline" : "secondary"} className="text-xs">
                      {p.is_active ? "In use" : "Off"}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
