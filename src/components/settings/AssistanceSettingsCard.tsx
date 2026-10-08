import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Copy, ExternalLink, Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAssistanceConfig, useSetAssistanceSetting } from "@/hooks/useUrgentAssistance";
import { normalizeIntlPhone, toTelLink, toWaLink } from "@/lib/contactLinks";

/** Settings → App → Guest Contact & Emergency. Managers/admins only; every change is logged. */
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

  const savePhone = (key: string) => {
    const raw = vals[key]?.trim();
    if (!raw) return save(key, null);
    const n = normalizeIntlPhone(raw);
    if (!n) return toast.error("Use international format with country code, e.g. +66 81 234 5678");
    setVals((v) => ({ ...v, [key]: n }));
    save(key, n);
  };

  const waPreview = toWaLink(normalizeIntlPhone(vals.whatsapp_display_number));
  const telPreview = toTelLink(normalizeIntlPhone(vals.urgent_call_number));
  const waInvalid = !!vals.whatsapp_display_number?.trim() && !waPreview;
  const telInvalid = !!vals.urgent_call_number?.trim() && !telPreview;

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"));

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Guest Contact &amp; Emergency</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          These numbers show on the guest "Need help?" card and the Front Desk panel. Saving here doesn't change any phone,
          WhatsApp account or line — it only changes what guests see.
        </p>

        {/* WhatsApp */}
        <div className="space-y-1.5 rounded-md border border-border p-3">
          <label className="text-xs font-medium flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" />Official WhatsApp Business Number</label>
          <div className="flex gap-2">
            <Input inputMode="tel" placeholder="+66 81 234 5678" value={vals.whatsapp_display_number ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, whatsapp_display_number: e.target.value }))} />
            <Button size="sm" onClick={() => savePhone("whatsapp_display_number")} disabled={waInvalid}>Save</Button>
          </div>
          {waInvalid && <p className="text-[11px] text-destructive">Include the country code, e.g. +66…</p>}
          {waPreview && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[11px] break-all">{waPreview}</code>
              <Button asChild size="sm" variant="outline"><a href={waPreview} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" />Preview WhatsApp</a></Button>
              <Button size="sm" variant="outline" onClick={() => copy(waPreview)}><Copy className="h-3.5 w-3.5 mr-1" />Copy link</Button>
            </div>
          )}
        </div>

        {/* Call */}
        <div className="space-y-1.5 rounded-md border border-border p-3">
          <label className="text-xs font-medium flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Urgent Assistance Call Number</label>
          <div className="flex gap-2">
            <Input inputMode="tel" placeholder="+66 81 234 5678" value={vals.urgent_call_number ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, urgent_call_number: e.target.value }))} />
            <Button size="sm" onClick={() => savePhone("urgent_call_number")} disabled={telInvalid}>Save</Button>
          </div>
          {telInvalid && <p className="text-[11px] text-destructive">Include the country code, e.g. +66…</p>}
          <p className="text-[11px] text-muted-foreground">
            Opens the guest's phone dialer from the Call camp button. Can match the WhatsApp number, but is saved separately.
            {telPreview && <> <a className="underline" href={telPreview}>Test dial</a> (opens your dialer only).</>}
          </p>
        </div>

        <div className="rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground mb-0.5">Three separate channels</p>
          WhatsApp messages and phone calls go straight to whoever holds that phone — CampStay can't see or track them.
          Only CampStay urgent requests are tracked, alerted and escalated here.
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Staffed hours (Bangkok time)</label>
          <div className="flex gap-2">
            <Input value={vals.staffed_hours_text ?? ""} placeholder="Front desk staffed 08:00–20:00 (Bangkok time)"
              onChange={(e) => setVals((v) => ({ ...v, staffed_hours_text: e.target.value }))} />
            <Button size="sm" onClick={() => save("staffed_hours_text", vals.staffed_hours_text?.trim() || null)}>Save</Button>
          </div>
        </div>
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
              Off by default. Turn on only after testing on the practice camp. A sent alert doesn't mean someone is available.
            </p>
          </div>
          <Switch checked={!!cfg?.urgent_requests_enabled} onCheckedChange={(v) => save("urgent_requests_enabled", v)} />
        </div>
      </CardContent>
    </Card>
  );
}
