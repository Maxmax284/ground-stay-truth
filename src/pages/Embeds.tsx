import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { useUnits } from "@/hooks/useUnits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Code2 } from "lucide-react";

const WIDGET_TYPES = [
  { value: "listing", label: "Full Listing", height: 700 },
  { value: "compact", label: "Compact Card", height: 320 },
  { value: "calendar", label: "Calendar Only", height: 400 },
  { value: "cta", label: "CTA Only", height: 180 },
];

const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

const FONT_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

const HIDEABLE_COMPONENTS = [
  { key: "photo", label: "Photo" },
  { key: "description", label: "Description" },
  { key: "amenities", label: "Amenities" },
  { key: "capacity", label: "Capacity Badge" },
  { key: "min_nights", label: "Minimum Nights" },
  { key: "cleaning_fee", label: "Cleaning Fee" },
  { key: "calendar", label: "Availability Calendar" },
  { key: "cta", label: "CTA Button" },
];

export default function Embeds() {
  const { t } = useTranslation();
  const { data: units } = useUnits();
  const { toast } = useToast();
  const activeUnits = units?.filter((u) => u.is_active) ?? [];

  // Unit & type
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedType, setSelectedType] = useState("listing");

  // Visibility toggles (all shown by default)
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Style
  const [accentColor, setAccentColor] = useState("#9a5a30");
  const [borderRadius, setBorderRadius] = useState(12);
  const [fontSize, setFontSize] = useState("md");
  const [darkMode, setDarkMode] = useState(false);
  const [shadow, setShadow] = useState("subtle");
  const [maxWidth, setMaxWidth] = useState(480);

  // CTA
  const [ctaTarget, setCtaTarget] = useState<"contact" | "register">("contact");
  const [contactUrl, setContactUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");

  const baseUrl = window.location.origin;
  const widget = WIDGET_TYPES.find((w) => w.value === selectedType)!;

  const resolvedContactUrl = ctaTarget === "register" ? `${baseUrl}/auth/guest` : contactUrl;

  const embedUrl = useMemo(() => {
    if (!selectedUnit) return "";
    const params = new URLSearchParams();
    if (resolvedContactUrl) params.set("contact_url", resolvedContactUrl);
    if (accentColor !== "#9a5a30") params.set("accent", accentColor);
    if (hidden.size > 0) params.set("hide", Array.from(hidden).join(","));
    if (borderRadius !== 12) params.set("radius", String(borderRadius));
    if (fontSize !== "md") params.set("font", fontSize);
    if (darkMode) params.set("dark", "1");
    if (shadow !== "subtle") params.set("shadow", shadow);
    if (maxWidth !== 480) params.set("max_w", String(maxWidth));
    if (ctaLabel.trim()) params.set("cta_label", ctaLabel.trim());
    const qs = params.toString();
    return `${baseUrl}/embed/${selectedType}/${selectedUnit}${qs ? `?${qs}` : ""}`;
  }, [selectedUnit, selectedType, resolvedContactUrl, accentColor, hidden, borderRadius, fontSize, darkMode, shadow, maxWidth, ctaLabel, baseUrl]);

  const iframeCode = selectedUnit
    ? `<iframe src="${embedUrl}" width="100%" height="${widget.height}" style="border:none;border-radius:${borderRadius}px;overflow:hidden;" loading="lazy" title="LMT CampStay Widget"></iframe>`
    : "";

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(iframeCode);
    toast({ title: t("common.copied"), description: t("embed.copiedToClipboard") });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Code2 className="h-6 w-6 text-primary" />
            {t("embed.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("embed.description")}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* ── Left: Controls ── */}
          <div className="space-y-4">
            {/* Unit & Type */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t("embed.unit")} & {t("embed.widgetType")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embed.unit")}</Label>
                  <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                    <SelectTrigger><SelectValue placeholder={t("bookingForm.selectUnit")} /></SelectTrigger>
                    <SelectContent>{activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WIDGET_TYPES.map((w) => (
                    <Badge
                      key={w.value}
                      variant={w.value === selectedType ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setSelectedType(w.value)}
                    >
                      {w.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Visibility Toggles */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t("embedBuilder.visibility")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {HIDEABLE_COMPONENTS.map((comp) => (
                  <div key={comp.key} className="flex items-center justify-between">
                    <Label className="text-xs font-normal">{comp.label}</Label>
                    <Switch
                      checked={!hidden.has(comp.key)}
                      onCheckedChange={() => toggleHidden(comp.key)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Style Customization */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t("embedBuilder.style")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Accent color */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embedBuilder.accentColor")}</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="font-mono text-xs h-8"
                      maxLength={7}
                    />
                  </div>
                </div>

                {/* Border radius */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embedBuilder.borderRadius")}: {borderRadius}px</Label>
                  <Slider
                    value={[borderRadius]}
                    onValueChange={([v]) => setBorderRadius(v)}
                    min={0}
                    max={24}
                    step={2}
                  />
                </div>

                {/* Font size */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embedBuilder.fontSize")}</Label>
                  <Select value={fontSize} onValueChange={setFontSize}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dark mode */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-normal">{t("embedBuilder.darkMode")}</Label>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>

                {/* Shadow */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embedBuilder.shadow")}</Label>
                  <Select value={shadow} onValueChange={setShadow}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SHADOW_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Max width */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embedBuilder.maxWidth")}</Label>
                  <Input
                    type="number"
                    value={maxWidth}
                    onChange={(e) => setMaxWidth(Number(e.target.value) || 480)}
                    className="h-8 text-xs"
                    min={200}
                    max={1200}
                  />
                </div>
              </CardContent>
            </Card>

            {/* CTA Configuration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t("embedBuilder.ctaConfig")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embed.ctaTarget")}</Label>
                  <Select value={ctaTarget} onValueChange={(v) => setCtaTarget(v as "contact" | "register")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contact">{t("embed.ctaTargetContact")}</SelectItem>
                      <SelectItem value="register">{t("embed.ctaTargetRegister")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {ctaTarget === "contact" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("embed.contactUrl")}</Label>
                    <Input
                      type="url"
                      placeholder="https://yoursite.com/contact"
                      value={contactUrl}
                      onChange={(e) => setContactUrl(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("embedBuilder.ctaLabelOverride")}</Label>
                  <Input
                    placeholder="Book Now"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">{t("embedBuilder.ctaLabelNote")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Preview ── */}
          <div className="space-y-4">
            {selectedUnit ? (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{t("embed.livePreview")}</CardTitle>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={copyCode}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> {t("common.copy")}
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={embedUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> {t("common.preview")}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg p-6 bg-muted/30 flex justify-center">
                      <iframe
                        key={embedUrl}
                        src={embedUrl}
                        width="100%"
                        height={widget.height}
                        style={{ border: "none", borderRadius: borderRadius, maxWidth: maxWidth }}
                        title="Widget Preview"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t("embed.embedCode")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted text-muted-foreground text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all border">
                      {iframeCode}
                    </pre>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <Code2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">{t("embedBuilder.selectUnitPrompt")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
