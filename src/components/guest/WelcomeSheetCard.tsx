import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useStayEssentials } from "@/hooks/useStayEssentials";
import { parseWelcomeSheet } from "@/lib/welcomeSheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Clock, Wifi, Dumbbell, Shirt, Info, Phone, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * The paper welcome binder, one card, in the binder's order. Read-only:
 * staff edit it in Settings → Welcome sheet. Empty sections are hidden.
 */
export function WelcomeSheetCard({ unitId }: { unitId?: string }) {
  const { t } = useTranslation();
  const { data: policies } = usePolicySettings();
  const { data: ess } = useStayEssentials(unitId);

  const sheet = useMemo(
    () => parseWelcomeSheet(policies?.find((p) => p.key === "welcome_sheet" && !p.property_id)?.value),
    [policies]
  );
  const pol = (k: string) => String(policies?.find((p) => p.key === k)?.value ?? "").replace(/^"|"$/g, "");
  const checkIn = pol("earliest_checkin_time");
  const checkOut = pol("checkout_time");

  const emergency = [
    ...(ess?.emergency_phone ? [{ label: ess.emergency_name || "Front Desk", phone: ess.emergency_phone }] : []),
    ...sheet.emergency,
  ];

  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast.success(t("welcomeSheet.copied", { defaultValue: "Copied" })));

  const Section = ({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) => (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="h-4 w-4 text-primary" />{title}</h3>
      <div className="text-sm text-muted-foreground whitespace-pre-line pl-6">{children}</div>
    </section>
  );

  return (
    <Card className="camp-pass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><BookOpen className="h-5 w-5 text-primary" />{t("welcomeSheet.title", { defaultValue: "Your stay — welcome sheet" })}</CardTitle>
        {sheet.welcome && <p className="text-sm text-muted-foreground whitespace-pre-line">{sheet.welcome}</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        {(sheet.reception || checkIn || checkOut) && (
          <Section icon={Clock} title={t("welcomeSheet.reception", { defaultValue: "Reception & office" })}>
            {sheet.reception && <p>{sheet.reception}</p>}
            {(checkIn || checkOut) && <p>{t("welcomeSheet.times", { defaultValue: "Check-in from {{in}} · Check-out by {{out}}", in: checkIn || "—", out: checkOut || "—" })}</p>}
          </Section>
        )}
        {(ess?.wifi_network || ess?.house_rules) && (
          <Section icon={Wifi} title={t("welcomeSheet.wifi", { defaultValue: "Wi-Fi & house rules" })}>
            {ess?.wifi_network && (
              <div className="flex flex-wrap items-center gap-2">
                <span>{ess.wifi_network}{ess.wifi_password ? ` · ${ess.wifi_password}` : ""}</span>
                {ess.wifi_password && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(ess.wifi_password)}><Copy className="h-3.5 w-3.5 mr-1" />{t("welcomeSheet.copyPassword", { defaultValue: "Copy password" })}</Button>}
              </div>
            )}
            {ess?.house_rules && <ul className="list-disc pl-4 mt-1">{rulesList(ess.house_rules).map((r) => <li key={r}>{r}</li>)}</ul>}
          </Section>
        )}
        {sheet.services && <Section icon={Dumbbell} title={t("welcomeSheet.services", { defaultValue: "What the camp can do for you" })}>{sheet.services}</Section>}
        {sheet.housekeeping && <Section icon={Shirt} title={t("welcomeSheet.housekeeping", { defaultValue: "Housekeeping & laundry" })}>{sheet.housekeeping}</Section>}
        {sheet.general && <Section icon={Info} title={t("welcomeSheet.general", { defaultValue: "General information" })}>{sheet.general}</Section>}
        {emergency.length > 0 && (
          <Section icon={Phone} title={t("welcomeSheet.emergency", { defaultValue: "Emergency numbers" })}>
            <ul className="space-y-1">
              {emergency.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{e.label}</span>
                  <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-primary underline-offset-2 hover:underline">{e.phone}</a>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function rulesList(raw: string): string[] {
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.filter(Boolean); } catch { /* plain text */ }
  return raw.split(/[\n•]+/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}
