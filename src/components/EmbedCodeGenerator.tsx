import { useState } from "react";
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

const WIDGET_TYPES = [
  { value: "listing", label: "Full Listing", description: "Complete unit card with calendar, pricing, amenities", height: 600 },
  { value: "compact", label: "Compact Card", description: "Small card with name, capacity, and price", height: 200 },
  { value: "calendar", label: "Calendar Only", description: "Availability calendar with legend", height: 380 },
  { value: "cta", label: "CTA Only", description: "Name, price, and call-to-action button", height: 160 },
];

export function EmbedCodeGenerator() {
  const { data: units } = useUnits();
  const { toast } = useToast();
  const activeUnits = units?.filter((u) => u.is_active) ?? [];

  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedType, setSelectedType] = useState("listing");
  const [contactUrl, setContactUrl] = useState("");

  const baseUrl = window.location.origin;
  const widget = WIDGET_TYPES.find((w) => w.value === selectedType)!;
  const contactParam = contactUrl ? `&contact_url=${encodeURIComponent(contactUrl)}` : "";
  const embedUrl = `${baseUrl}/embed/${selectedType}/${selectedUnit}${contactParam ? `?${contactParam.slice(1)}` : ""}`;
  const iframeCode = selectedUnit
    ? `<iframe src="${embedUrl}" width="100%" height="${widget.height}" style="border:none;border-radius:12px;overflow:hidden;" loading="lazy" title="Ground Stay - ${widget.label}"></iframe>`
    : "";

  const copyCode = () => {
    navigator.clipboard.writeText(iframeCode);
    toast({ title: "Copied!", description: "Embed code copied to clipboard." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          Embeddable Widgets
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Generate embed codes to display listings, calendars, and CTAs on your WordPress or external site.
          Widgets auto-update from Ground Stay data.
        </p>
        <p className="text-xs text-muted-foreground">
          Embeds display availability from Ground Stay but do not accept bookings directly. All reservations are managed through Ground Stay.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Select a unit" />
              </SelectTrigger>
              <SelectContent>
                {activeUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Widget Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_TYPES.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedType === "cta" && (
          <div className="space-y-2">
            <Label>Contact / Booking URL</Label>
            <Input
              type="url"
              placeholder="https://yoursite.com/contact"
              value={contactUrl}
              onChange={(e) => setContactUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The "Check Availability" button will link to this URL. Leave empty to show a disabled button.
            </p>
          </div>
        )}

        {/* Widget type descriptions */}
        <div className="flex flex-wrap gap-2">
          {WIDGET_TYPES.map((w) => (
            <Badge
              key={w.value}
              variant={w.value === selectedType ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedType(w.value)}
            >
              {w.label}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{widget.description}</p>

        {selectedUnit && (
          <>
            <Separator />

            {/* Code block */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Embed Code</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyCode}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={embedUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Preview
                    </a>
                  </Button>
                </div>
              </div>
              <pre className="bg-muted text-muted-foreground text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all border">
                {iframeCode}
              </pre>
            </div>

            {/* Live preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Live Preview</Label>
              <div className="border rounded-lg p-4 bg-muted/30 flex justify-center">
                <iframe
                  src={embedUrl}
                  width="100%"
                  height={widget.height}
                  style={{ border: "none", borderRadius: 12, maxWidth: 500 }}
                  title="Widget Preview"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
