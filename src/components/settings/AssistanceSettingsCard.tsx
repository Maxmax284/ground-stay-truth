import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAssistanceConfig, useSetAssistanceSetting } from "@/hooks/useUrgentAssistance";

const FIELDS = [
  { key: "urgent_call_number", label: "Approved urgent call number", hint: "Shown as the Call camp button. Leave blank to hide it." },
  { key: "whatsapp_display_number", label: "WhatsApp number to display", hint: "Display only — the existing WhatsApp number is not changed." },
  { key: "staffed_hours_text", label: "Staffed hours (Bangkok time)", hint: "e.g. Front desk staffed 08:00–20:00 (Bangkok time)." },
] as const;

/** Management-controlled guest assistance settings. Every change is logged. */
export function AssistanceSettingsCard() {
  const { data: cfg } = useAssistanceConfig();
  const set = useSetAssistanceSetting();
  const [vals, setVals] = useState<Record<string, string>>({});

  useEffect(() => {
    if (cfg) setVals({
      urgent_call_number: cfg.urgent_call_number ?? "",
      whatsapp_display_number: cfg.whatsapp_display_number ?? "",
      staffed_hours_text: cfg.staffed_hours_text ?? "",
      after_hours_notice: cfg.after_hours_notice ?? "",
    });
  }, [cfg]);

  const save = async (key: string, value: unknown) => {
    try { await set.mutateAsync({ key, value }); toast.success("Saved"); }
    catch (e: any) { toast.error(e?.message ?? "Couldn't save"); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Guest urgent help</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Controls the "Need help?" card in the guest portal. It does not change any phone or WhatsApp line.
          The existing Stay Essentials emergency contact always stays visible.
        </p>
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs font-medium">{f.label}</label>
            <div className="flex gap-2">
              <Input value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
              <Button size="sm" onClick={() => save(f.key, vals[f.key]?.trim() || null)}>Save</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{f.hint}</p>
          </div>
        ))}
        <div className="space-y-1">
          <label className="text-xs font-medium">After-hours notice to guests</label>
          <Textarea rows={2} value={vals.after_hours_notice ?? ""}
            placeholder="Messages may not be seen right away, especially at night. This is not a guaranteed 24/7 service."
            onChange={(e) => setVals((v) => ({ ...v, after_hours_notice: e.target.value }))} />
          <Button size="sm" onClick={() => save("after_hours_notice", vals.after_hours_notice?.trim() || null)}>Save</Button>
        </div>
        <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
          <div>
            <p className="font-medium">Allow guests to send urgent requests</p>
            <p className="text-[11px] text-muted-foreground">
              Off by default. Turn on only after testing on the practice camp. Alerts go out by email and phone alerts;
              there's no automatic escalation yet, and a sent alert doesn't mean someone is available.
            </p>
          </div>
          <Switch checked={!!cfg?.urgent_requests_enabled} onCheckedChange={(v) => save("urgent_requests_enabled", v)} />
        </div>
      </CardContent>
    </Card>
  );
}
