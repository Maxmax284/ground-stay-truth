import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Plus, Trash2, ArrowUp, ArrowDown, Eye, Image as ImageIcon, Info } from "lucide-react";
import { useUnits } from "@/hooks/useUnits";
import {
  type StayShowcaseConfig,
  type ShowcaseSlide,
  DEFAULT_SHOWCASE,
  normalizeShowcase,
} from "@/lib/stayShowcase";
import AccommodationShowcase from "@/components/AccommodationShowcase";

const NONE = "__none__";

export function AccommodationShowcaseEditor() {
  const { toast } = useToast();
  const { data: units } = useUnits();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [config, setConfig] = useState<StayShowcaseConfig>({ ...DEFAULT_SHOWCASE });
  const [showPreview, setShowPreview] = useState(false);

  // Load existing setting (global, property_id is NULL)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("policy_settings")
        .select("id,value")
        .eq("key", "stay_showcase")
        .is("property_id", null)
        .maybeSingle();
      if (!error && data) {
        setSettingId(data.id);
        setConfig(normalizeShowcase(data.value));
      }
      setLoading(false);
    })();
  }, []);

  // Build a flat list of {unitId, unitName, url} from all units' photos for the picker
  const photoOptions = useMemo(() => {
    const out: { unitId: string; unitName: string; url: string }[] = [];
    (units ?? []).forEach((u) => {
      (u.photos ?? []).forEach((url) => out.push({ unitId: u.id, unitName: u.name, url }));
    });
    return out;
  }, [units]);

  const update = (patch: Partial<StayShowcaseConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  const updateSlide = (id: string, patch: Partial<ShowcaseSlide>) =>
    setConfig((c) => ({
      ...c,
      slides: c.slides.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const removeSlide = (id: string) =>
    setConfig((c) => ({ ...c, slides: c.slides.filter((s) => s.id !== id) }));

  const moveSlide = (id: string, dir: -1 | 1) =>
    setConfig((c) => {
      const arr = [...c.slides].sort((a, b) => a.order - b.order);
      const i = arr.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return c;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...c, slides: arr.map((s, k) => ({ ...s, order: k })) };
    });

  const addSlideFromUrl = (url: string, unitId?: string | null, caption?: string) => {
    const id = `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setConfig((c) => ({
      ...c,
      slides: [
        ...c.slides,
        {
          id,
          image_url: url,
          caption: caption ?? "",
          alt: caption ?? "",
          link_unit_id: unitId ?? null,
          link_url: null,
          active: true,
          order: c.slides.length,
        },
      ],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (settingId) {
        const { error } = await supabase
          .from("policy_settings")
          .update({ value: config as any, updated_by: user?.id ?? null })
          .eq("id", settingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("policy_settings")
          .insert({
            key: "stay_showcase",
            value: config as any,
            description: "Public Accommodation Showcase on the /stay page.",
            property_id: null,
            updated_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        setSettingId(data.id);
      }
      toast({ title: "Showcase saved", description: "Public /stay page will reflect changes on next load." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  const sortedSlides = [...config.slides].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      {/* Helper banner */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-4 pb-4 flex gap-3 items-start">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Use real room/villa photos. Avoid blurry images. Landscape orientation works best.
            Don't use stock photos for actual rooms — guests will spot it.
          </p>
        </CardContent>
      </Card>

      {/* Block-level controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Display Settings</CardTitle>
          <CardDescription className="text-xs">Controls how the showcase appears on the public /stay page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
            <div>
              <Label className="text-sm font-medium">Show on /stay page</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Hide if photos aren't ready.</p>
            </div>
            <Switch checked={config.enabled} onCheckedChange={(v) => update({ enabled: v })} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Layout</Label>
              <Select value={config.layout} onValueChange={(v) => update({ layout: v as any })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hero_fade">Hero Fade — single large image</SelectItem>
                  <SelectItem value="card_carousel">Card Carousel — 2–3 cards</SelectItem>
                  <SelectItem value="gallery_strip">Gallery Strip — horizontal scroll</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Image fit</Label>
              <Select value={config.image_fit} onValueChange={(v) => update({ image_fit: v as any })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover (fill, may crop)</SelectItem>
                  <SelectItem value="contain">Contain (no crop, letterbox)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Speed</Label>
              <Select value={config.speed} onValueChange={(v) => update({ speed: v as any })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">Slow (7s)</SelectItem>
                  <SelectItem value="normal">Normal (4.5s)</SelectItem>
                  <SelectItem value="fast">Fast (2.5s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Transition</Label>
              <Select value={config.transition} onValueChange={(v) => update({ transition: v as any })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fade">Fade</SelectItem>
                  <SelectItem value="slide">Slide</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <ToggleRow label="Autoplay" checked={config.autoplay} onChange={(v) => update({ autoplay: v })} />
            <ToggleRow label="Show captions" checked={config.show_captions} onChange={(v) => update({ show_captions: v })} />
            <ToggleRow label="Show indicators" checked={config.show_indicators} onChange={(v) => update({ show_indicators: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Slide manager */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Slides ({sortedSlides.length})</CardTitle>
            <CardDescription className="text-xs">Add images from existing unit photos or paste a URL.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add from existing photos */}
          <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
            <Label className="text-xs">Add from existing unit photos</Label>
            <Select
              value={NONE}
              onValueChange={(v) => {
                if (v === NONE) return;
                const opt = photoOptions.find((o) => o.url === v);
                if (opt) addSlideFromUrl(opt.url, opt.unitId, opt.unitName);
              }}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Pick a photo from a unit…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE} disabled>Pick a photo…</SelectItem>
                {photoOptions.length === 0 && (
                  <SelectItem value="__empty__" disabled>No unit photos yet — upload via Units page first</SelectItem>
                )}
                {photoOptions.map((o, i) => (
                  <SelectItem key={`${o.unitId}-${i}`} value={o.url}>
                    {o.unitName} — photo {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add by URL */}
          <UrlAdder onAdd={(url) => addSlideFromUrl(url)} />

          {/* Slide list */}
          {sortedSlides.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No slides yet.</p>
          ) : (
            <div className="space-y-3">
              {sortedSlides.map((s, i) => (
                <div key={s.id} className="flex gap-3 p-3 rounded-lg border bg-card/50">
                  <div className="w-24 h-20 shrink-0 rounded overflow-hidden bg-muted">
                    {s.image_url ? (
                      <img src={s.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={s.active} onCheckedChange={(v) => updateSlide(s.id, { active: v })} />
                      <span className="text-xs text-muted-foreground">{s.active ? "Visible" : "Hidden"}</span>
                      <div className="ml-auto flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(s.id, -1)} disabled={i === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(s.id, 1)} disabled={i === sortedSlides.length - 1}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeSlide(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      value={s.caption ?? ""}
                      onChange={(e) => updateSlide(s.id, { caption: e.target.value })}
                      placeholder="Caption (e.g. Sea View Villa)"
                      className="h-8 text-sm"
                    />
                    <Input
                      value={s.alt ?? ""}
                      onChange={(e) => updateSlide(s.id, { alt: e.target.value })}
                      placeholder="Alt text (for accessibility & SEO)"
                      className="h-8 text-sm"
                    />
                    <div className="grid sm:grid-cols-2 gap-2">
                      <Select
                        value={s.link_unit_id ?? NONE}
                        onValueChange={(v) => updateSlide(s.id, { link_unit_id: v === NONE ? null : v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Link to unit (optional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No unit link</SelectItem>
                          {(units ?? []).map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={s.link_url ?? ""}
                        onChange={(e) => updateSlide(s.id, { link_url: e.target.value || null })}
                        placeholder="External link (optional)"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview + Save */}
      <div className="flex flex-wrap gap-2 justify-between items-center sticky bottom-0 bg-background/95 backdrop-blur py-3 -mx-1 px-1 border-t">
        <Button variant="outline" size="sm" onClick={() => setShowPreview((p) => !p)}>
          <Eye className="h-3.5 w-3.5 mr-1.5" /> {showPreview ? "Hide preview" : "Show preview"}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : "Save Showcase"}
        </Button>
      </div>

      {showPreview && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Live Preview</CardTitle>
            <CardDescription className="text-xs">Renders with current draft settings (not yet saved).</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <AccommodationShowcase configOverride={config} forceShow />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card/50">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function UrlAdder({ onAdd }: { onAdd: (url: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
      <Label className="text-xs">Or paste an image URL</Label>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="h-9 text-sm"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!url.trim()}
          onClick={() => {
            onAdd(url.trim());
            setUrl("");
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
