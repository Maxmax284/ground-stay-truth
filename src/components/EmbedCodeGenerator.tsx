import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUnits } from "@/hooks/useUnits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Code2 } from "lucide-react";

export function EmbedCodeGenerator() {
  const { t } = useTranslation();
  const { data: units } = useUnits();
  const { toast } = useToast();
  const activeUnits = units?.filter((u) => u.is_active) ?? [];

  const WIDGET_TYPES = [
    { value: "listing", label: t("embed.widgetTypes.listing"), description: t("embed.widgetTypes.listingDesc"), height: 600 },
    { value: "compact", label: t("embed.widgetTypes.compact"), description: t("embed.widgetTypes.compactDesc"), height: 200 },
    { value: "calendar", label: t("embed.widgetTypes.calendar"), description: t("embed.widgetTypes.calendarDesc"), height: 380 },
    { value: "cta", label: t("embed.widgetTypes.cta"), description: t("embed.widgetTypes.ctaDesc"), height: 160 },
  ];

  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedType, setSelectedType] = useState("listing");
  const [contactUrl, setContactUrl] = useState("");

  const baseUrl = window.location.origin;
  const widget = WIDGET_TYPES.find((w) => w.value === selectedType)!;
  const contactParam = contactUrl ? `&contact_url=${encodeURIComponent(contactUrl)}` : "";
  const embedUrl = `${baseUrl}/embed/${selectedType}/${selectedUnit}${contactParam ? `?${contactParam.slice(1)}` : ""}`;
  const iframeCode = selectedUnit ? `<iframe src="${embedUrl}" width="100%" height="${widget.height}" style="border:none;border-radius:12px;overflow:hidden;" loading="lazy" title="Ground Stay - ${widget.label}"></iframe>` : "";

  const copyCode = () => { navigator.clipboard.writeText(iframeCode); toast({ title: t("common.copied"), description: t("embed.copiedToClipboard") }); };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Code2 className="h-5 w-5 text-primary" />{t("embed.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("embed.description")}</p>
        <p className="text-xs text-muted-foreground">{t("embed.note")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>{t("embed.unit")}</Label><Select value={selectedUnit} onValueChange={setSelectedUnit}><SelectTrigger><SelectValue placeholder={t("bookingForm.selectUnit")} /></SelectTrigger><SelectContent>{activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>{t("embed.widgetType")}</Label><Select value={selectedType} onValueChange={setSelectedType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WIDGET_TYPES.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {selectedType === "cta" && (
          <div className="space-y-2"><Label>{t("embed.contactUrl")}</Label><Input type="url" placeholder="https://yoursite.com/contact" value={contactUrl} onChange={(e) => setContactUrl(e.target.value)} /><p className="text-xs text-muted-foreground">{t("embed.contactUrlNote")}</p></div>
        )}
        <div className="flex flex-wrap gap-2">{WIDGET_TYPES.map((w) => <Badge key={w.value} variant={w.value === selectedType ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedType(w.value)}>{w.label}</Badge>)}</div>
        <p className="text-sm text-muted-foreground">{widget.description}</p>
        {selectedUnit && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label className="text-xs text-muted-foreground">{t("embed.embedCode")}</Label>
                <div className="flex gap-2"><Button size="sm" variant="outline" onClick={copyCode}><Copy className="h-3.5 w-3.5 mr-1" /> {t("common.copy")}</Button><Button size="sm" variant="outline" asChild><a href={embedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> {t("common.preview")}</a></Button></div>
              </div>
              <pre className="bg-muted text-muted-foreground text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all border">{iframeCode}</pre>
            </div>
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">{t("embed.livePreview")}</Label><div className="border rounded-lg p-4 bg-muted/30 flex justify-center"><iframe src={embedUrl} width="100%" height={widget.height} style={{ border: "none", borderRadius: 12, maxWidth: 500 }} title="Widget Preview" /></div></div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
