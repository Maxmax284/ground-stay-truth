import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { useAuth } from "@/hooks/useAuth";
import { AIStudioPanel } from "./AIStudioPanel";
import { AIRefinementChat } from "./AIRefinementChat";
import {
  Plane, Save, Plus, X, Sparkles, Loader2, GripVertical, Image as ImageIcon, MapPin, RefreshCw, Tag,
  Check, Lightbulb,
} from "lucide-react";

export interface WelcomePhoto {
  url: string;
  caption: string;
  alt: string;
  section_index: number | null;
  tag: "landmark" | "direction" | "vehicle" | "map" | "sign" | "other";
}

export interface WelcomeSection {
  title: string;
  content: string;
}

export interface WelcomeTemplate {
  welcome_message: string;
  sections: WelcomeSection[];
  photos: WelcomePhoto[];
  enabled: boolean;
}

const AIRPORTS = [
  { id: "bkk", label: "BKK (Suvarnabhumi)", icon: "✈️" },
  { id: "samui", label: "Samui (USM)", icon: "🌴" },
] as const;

const PHOTO_TAGS: { value: WelcomePhoto["tag"]; label: string }[] = [
  { value: "landmark", label: "Landmark" },
  { value: "direction", label: "Direction" },
  { value: "vehicle", label: "Vehicle" },
  { value: "map", label: "Map" },
  { value: "sign", label: "Sign" },
  { value: "other", label: "Other" },
];

const DEFAULT_TEMPLATE: WelcomeTemplate = {
  welcome_message: "",
  sections: [],
  photos: [],
  enabled: true,
};

function migratePhotos(photos: unknown): WelcomePhoto[] {
  if (!Array.isArray(photos)) return [];
  return photos.map((p: any) => {
    if (typeof p === "string") {
      return { url: p, caption: "", alt: "", section_index: null, tag: "other" as const };
    }
    return {
      url: p.url || "",
      caption: p.caption || "",
      alt: p.alt || "",
      section_index: p.section_index ?? null,
      tag: p.tag || "other",
    };
  });
}

function parseTemplate(value: unknown): WelcomeTemplate {
  if (!value) return { ...DEFAULT_TEMPLATE };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return {
      welcome_message: parsed.welcome_message || "",
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      photos: migratePhotos(parsed.photos),
      enabled: parsed.enabled !== false,
    };
  } catch {
    return { ...DEFAULT_TEMPLATE };
  }
}

interface SectionSuggestion {
  title: string;
  description: string;
  content: string;
}

export function ArrivalWelcomeEditor() {
  const { data: settings } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const { session } = useAuth();
  const [activeAirport, setActiveAirport] = useState<string>("bkk");
  const [drafting, setDrafting] = useState(false);
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null);
  const [aiContext, setAiContext] = useState("");
  const [aiTone, setAiTone] = useState("friendly");
  const [localEdits, setLocalEdits] = useState<Record<string, WelcomeTemplate>>({});
  const [suggestions, setSuggestions] = useState<SectionSuggestion[]>([]);

  const byKey = useMemo(() => {
    const map: Record<string, any> = {};
    settings?.forEach((s) => { map[s.key] = s; });
    return map;
  }, [settings]);

  const getTemplate = (airport: string): WelcomeTemplate => {
    if (localEdits[airport]) return localEdits[airport];
    const setting = byKey[`arrival_welcome_${airport}`];
    return parseTemplate(setting?.value);
  };

  const setTemplate = (airport: string, template: WelcomeTemplate) => {
    setLocalEdits((prev) => ({ ...prev, [airport]: template }));
  };

  const updateField = (airport: string, field: keyof WelcomeTemplate, value: any) => {
    const current = getTemplate(airport);
    setTemplate(airport, { ...current, [field]: value });
  };

  const updateSection = (airport: string, idx: number, field: keyof WelcomeSection, value: string) => {
    const current = getTemplate(airport);
    const sections = [...current.sections];
    sections[idx] = { ...sections[idx], [field]: value };
    setTemplate(airport, { ...current, sections });
  };

  const addSection = (airport: string) => {
    const current = getTemplate(airport);
    setTemplate(airport, {
      ...current,
      sections: [...current.sections, { title: "", content: "" }],
    });
  };

  const removeSection = (airport: string, idx: number) => {
    const current = getTemplate(airport);
    const photos = current.photos.map((p) => {
      if (p.section_index === idx) return { ...p, section_index: null };
      if (p.section_index !== null && p.section_index > idx) return { ...p, section_index: p.section_index - 1 };
      return p;
    });
    setTemplate(airport, {
      ...current,
      sections: current.sections.filter((_, i) => i !== idx),
      photos,
    });
  };

  const updatePhoto = (airport: string, idx: number, field: keyof WelcomePhoto, value: any) => {
    const current = getTemplate(airport);
    const photos = [...current.photos];
    photos[idx] = { ...photos[idx], [field]: value };
    setTemplate(airport, { ...current, photos });
  };

  const addPhoto = (airport: string) => {
    const current = getTemplate(airport);
    setTemplate(airport, {
      ...current,
      photos: [...current.photos, { url: "", caption: "", alt: "", section_index: null, tag: "other" }],
    });
  };

  const removePhoto = (airport: string, idx: number) => {
    const current = getTemplate(airport);
    setTemplate(airport, { ...current, photos: current.photos.filter((_, i) => i !== idx) });
  };

  const photosForSection = (template: WelcomeTemplate, sectionIdx: number) =>
    template.photos.filter((p) => p.section_index === sectionIdx && p.url);

  const handleSave = async (airport: string) => {
    const setting = byKey[`arrival_welcome_${airport}`];
    if (!setting) {
      toast({ title: "Error", description: "Setting not found. Please reload.", variant: "destructive" });
      return;
    }
    const template = getTemplate(airport);
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: JSON.stringify(template) });
      setLocalEdits((prev) => { const next = { ...prev }; delete next[airport]; return next; });
      toast({ title: "Saved!", description: `${airport.toUpperCase()} arrival welcome updated.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSectionRewrite = async (airport: string, sectionIdx: number) => {
    const template = getTemplate(airport);
    const section = template.sections[sectionIdx];
    if (!section?.title && !section?.content) {
      toast({ title: "Nothing to rewrite", description: "Add a title or content first.", variant: "destructive" });
      return;
    }
    setRewritingIdx(sectionIdx);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/draft-arrival-welcome`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            airport,
            mode: "rewrite_section",
            section: { title: section.title, content: section.content },
            context: aiContext,
            tone: aiTone,
          }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Section rewrite failed");
      }
      const { draft } = await resp.json();
      if (draft?.title || draft?.content) {
        const sections = [...template.sections];
        sections[sectionIdx] = {
          title: draft.title || section.title,
          content: draft.content || section.content,
        };
        setTemplate(airport, { ...template, sections });
        toast({ title: "Section rewritten", description: "Review the updated content." });
      }
    } catch (err: any) {
      toast({ title: "Rewrite Failed", description: err.message, variant: "destructive" });
    } finally {
      setRewritingIdx(null);
    }
  };

  const handleDraftGenerated = (airport: string, draft: { welcome_message?: string; sections?: any[] }) => {
    const current = getTemplate(airport);
    setTemplate(airport, {
      ...current,
      welcome_message: draft.welcome_message || current.welcome_message,
      sections: draft.sections || current.sections,
    });
  };

  const handleChatTemplateUpdate = (airport: string, partial: Partial<WelcomeTemplate>) => {
    const current = getTemplate(airport);
    setTemplate(airport, {
      ...current,
      ...(partial.welcome_message !== undefined ? { welcome_message: partial.welcome_message } : {}),
      ...(partial.sections !== undefined ? { sections: partial.sections } : {}),
    });
  };

  const acceptSuggestion = (airport: string, suggestion: SectionSuggestion) => {
    const current = getTemplate(airport);
    setTemplate(airport, {
      ...current,
      sections: [...current.sections, { title: suggestion.title, content: suggestion.content }],
    });
    setSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
    toast({ title: "Section added", description: `"${suggestion.title}" added to the guide.` });
  };

  const isDirty = (airport: string) => !!localEdits[airport];

  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Plane className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Arrival Welcome Guide</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customize what guests see after confirming they've landed. Separate templates for each airport.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeAirport} onValueChange={(v) => { setActiveAirport(v); setSuggestions([]); }}>
        <TabsList className="bg-muted/50">
          {AIRPORTS.map((a) => {
            const tmpl = getTemplate(a.id);
            return (
              <TabsTrigger key={a.id} value={a.id} className="gap-1.5">
                <span>{a.icon}</span>
                {a.label}
                {!tmpl.enabled && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 border-muted-foreground/30">Off</Badge>}
                {isDirty(a.id) && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">unsaved</Badge>}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {AIRPORTS.map((airport) => {
          const template = getTemplate(airport.id);
          return (
            <TabsContent key={airport.id} value={airport.id} className="space-y-4 mt-3">
              {/* Enable/Disable Toggle */}
              <Card className={`${template.enabled ? "border-primary/20 bg-primary/5" : "border-muted bg-muted/30"}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{airport.label} Arrival Guide</p>
                    <p className="text-xs text-muted-foreground">
                      {template.enabled
                        ? "Guests landing here will see the welcome guide after confirming their arrival."
                        : "Disabled — guests will still confirm their location but won't see a welcome guide."}
                    </p>
                  </div>
                  <Switch
                    checked={template.enabled}
                    onCheckedChange={(checked) => updateField(airport.id, "enabled", checked)}
                  />
                </CardContent>
              </Card>

              {/* AI Studio Panel */}
              <AIStudioPanel
                airport={airport.id}
                airportLabel={airport.label}
                template={template}
                tone={aiTone}
                onToneChange={setAiTone}
                context={aiContext}
                onContextChange={setAiContext}
                onDraftGenerated={(draft) => handleDraftGenerated(airport.id, draft)}
                onSuggestionsReceived={setSuggestions}
                drafting={drafting}
                setDrafting={setDrafting}
              />

              {/* Section suggestions */}
              {suggestions.length > 0 && (
                <Card className="border-accent/30 bg-accent/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-accent-foreground" />
                      <span className="text-sm font-medium">Suggested Sections</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-accent/30 text-accent-foreground">
                        {suggestions.length} ideas
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSuggestions([])}
                        className="ml-auto h-6 text-xs text-muted-foreground"
                      >
                        Dismiss
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {suggestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-background/60 border border-border/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{s.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acceptSuggestion(airport.id, s)}
                            className="h-7 gap-1 text-xs shrink-0 border-primary/30 text-primary hover:bg-primary/5"
                          >
                            <Check className="h-3 w-3" /> Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Refinement Chat */}
              <AIRefinementChat
                airport={airport.id}
                airportLabel={airport.label}
                template={template}
                tone={aiTone}
                context={aiContext}
                onTemplateUpdate={(partial) => handleChatTemplateUpdate(airport.id, partial)}
              />

              {/* Welcome Message */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Welcome Message
                </Label>
                <Textarea
                  value={template.welcome_message}
                  onChange={(e) => updateField(airport.id, "welcome_message", e.target.value)}
                  placeholder="Welcome to Thailand! Your driver is on the way..."
                  rows={2}
                  className="text-sm"
                />
              </div>

              {/* Sections */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Content Sections</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addSection(airport.id)}
                    className="h-7 gap-1 text-xs"
                  >
                    <Plus className="h-3 w-3" /> Add Section
                  </Button>
                </div>

                {template.sections.map((section, idx) => {
                  const sectionPhotos = photosForSection(template, idx);
                  const isRewriting = rewritingIdx === idx;
                  return (
                    <Card key={idx} className="border-border/50">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                          <Input
                            value={section.title}
                            onChange={(e) => updateSection(airport.id, idx, "title", e.target.value)}
                            placeholder="Section title (e.g., 'What to Do Now')"
                            className="h-8 text-sm font-medium"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSectionRewrite(airport.id, idx)}
                            disabled={isRewriting || drafting}
                            className="h-8 gap-1 text-xs shrink-0"
                            title="AI rewrite this section"
                          >
                            {isRewriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            <Sparkles className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSection(airport.id, idx)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Textarea
                          value={section.content}
                          onChange={(e) => updateSection(airport.id, idx, "content", e.target.value)}
                          placeholder="Step-by-step instructions, tips, or directions..."
                          rows={4}
                          className="text-sm"
                        />
                        {sectionPhotos.length > 0 && (
                          <div className="flex gap-2 flex-wrap pt-1">
                            {sectionPhotos.map((p, pi) => (
                              <div key={pi} className="relative group">
                                <img src={p.url} alt={p.alt || p.caption} className="h-12 w-16 rounded object-cover border" />
                                {p.caption && (
                                  <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-[8px] text-center truncate px-0.5">
                                    {p.caption}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {template.sections.length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-4 border border-dashed rounded-lg">
                    No sections yet. Add one or use AI to generate a draft.
                  </p>
                )}
              </div>

              {/* Photo Manager */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Reference Photos
                </Label>
                <p className="text-xs text-muted-foreground">
                  Add photos with captions and link them to specific sections. Guests see these inline with directions.
                </p>

                {template.photos.map((photo, idx) => (
                  <Card key={idx} className="border-border/50">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex gap-3">
                        <div className="shrink-0">
                          {photo.url ? (
                            <img src={photo.url} alt={photo.alt || `Photo ${idx + 1}`} className="h-20 w-28 rounded object-cover border" />
                          ) : (
                            <div className="h-20 w-28 rounded border border-dashed flex items-center justify-center text-muted-foreground/40">
                              <ImageIcon className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <Input
                            value={photo.url}
                            onChange={(e) => updatePhoto(airport.id, idx, "url", e.target.value)}
                            placeholder="https://example.com/photo.jpg"
                            className="h-8 text-xs"
                          />
                          <div className="flex gap-1.5">
                            <Input
                              value={photo.caption}
                              onChange={(e) => updatePhoto(airport.id, idx, "caption", e.target.value)}
                              placeholder="Caption (e.g., 'Look for this green sign')"
                              className="h-7 text-xs flex-1"
                            />
                            <Input
                              value={photo.alt}
                              onChange={(e) => updatePhoto(airport.id, idx, "alt", e.target.value)}
                              placeholder="Alt text"
                              className="h-7 text-xs w-32"
                            />
                          </div>
                          <div className="flex gap-1.5 items-center">
                            <Select
                              value={photo.section_index !== null ? String(photo.section_index) : "none"}
                              onValueChange={(v) => updatePhoto(airport.id, idx, "section_index", v === "none" ? null : Number(v))}
                            >
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue placeholder="Link to section..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No section (general)</SelectItem>
                                {template.sections.map((s, si) => (
                                  <SelectItem key={si} value={String(si)}>
                                    {s.title || `Section ${si + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={photo.tag}
                              onValueChange={(v) => updatePhoto(airport.id, idx, "tag", v)}
                            >
                              <SelectTrigger className="h-7 text-xs w-28">
                                <Tag className="h-3 w-3 mr-1 shrink-0" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PHOTO_TAGS.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removePhoto(airport.id, idx)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addPhoto(airport.id)}
                  className="h-7 gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" /> Add Photo
                </Button>
              </div>

              <Separator />

              {/* Save */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {isDirty(airport.id) ? "You have unsaved changes." : "All changes saved."}
                </p>
                <Button
                  onClick={() => handleSave(airport.id)}
                  disabled={!isDirty(airport.id) || updateSetting.isPending}
                  className="gap-1.5"
                >
                  <Save className="h-4 w-4" />
                  Save {airport.label}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
