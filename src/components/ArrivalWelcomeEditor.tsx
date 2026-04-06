import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { useAuth } from "@/hooks/useAuth";
import { useProperty } from "@/hooks/useProperty";
import { AIStudioPanel } from "./AIStudioPanel";
import { AIRefinementChat } from "./AIRefinementChat";
import { GuidedSectionEditor } from "./GuidedSectionEditor";
import { SECTION_TEMPLATES, getJourneyTemplates, getSituationalTemplates, ALL_ARRIVAL_LOCATIONS } from "@/lib/airportFactSheets";
import {
  Plane, Save, Plus, X, Sparkles, Loader2, GripVertical, Image as ImageIcon, MapPin, RefreshCw, Tag,
  Check, Lightbulb, ChevronDown, ChevronUp, BookOpen, Eye, Smartphone, Building2, Ship, Bus,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

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

const LOCATIONS = ALL_ARRIVAL_LOCATIONS;

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
  const { activeProperty, activePropertyId } = useProperty();
  const { data: settings } = usePolicySettings(activePropertyId);
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const { session } = useAuth();
  const [activeAirport, setActiveAirport] = useState<string>("bkk");
  const [drafting, setDrafting] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiTone, setAiTone] = useState("friendly");
  const [localEdits, setLocalEdits] = useState<Record<string, WelcomeTemplate>>({});
  const [suggestions, setSuggestions] = useState<SectionSuggestion[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [allSectionsExpanded, setAllSectionsExpanded] = useState<Record<string, boolean>>({});

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

  const addSection = (airport: string, title?: string) => {
    const current = getTemplate(airport);
    setTemplate(airport, {
      ...current,
      sections: [...current.sections, { title: title || "", content: "" }],
    });
  };

  const [showAddSectionPicker, setShowAddSectionPicker] = useState(false);

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
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Arrival Welcome Guides</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customize what guests see after confirming their arrival. Separate templates for flights, ferries, and buses.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Property scope indicator */}
      {activeProperty && (
        <Alert className={`border-l-4 ${activeProperty.slug === "lamai" ? "border-l-destructive bg-destructive/5" : "border-l-[hsl(var(--accent))] bg-accent/5"}`}>
          <Building2 className="h-4 w-4" />
          <AlertDescription className="text-sm">
            You are editing the arrival guide for <span className="font-semibold">{activeProperty.name}</span>. 
            Changes here only apply to this property.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeAirport} onValueChange={(v) => { setActiveAirport(v); setSuggestions([]); }}>
        <div className="overflow-x-auto">
          <TabsList className="bg-muted/50 w-auto inline-flex">
            {LOCATIONS.map((a) => {
              const tmpl = getTemplate(a.id);
              return (
                <TabsTrigger key={a.id} value={a.id} className="gap-1.5 text-xs whitespace-nowrap">
                  <span>{a.icon}</span>
                  {a.label}
                  {!tmpl.enabled && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 border-muted-foreground/30">Off</Badge>}
                  {isDirty(a.id) && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">unsaved</Badge>}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {LOCATIONS.map((airport) => {
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
                propertyId={activePropertyId}
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
                propertyId={activePropertyId}
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
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    Content Sections
                    {template.sections.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                        {template.sections.length}
                      </Badge>
                    )}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    {template.sections.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAllSectionsExpanded(prev => ({ ...prev, [airport.id]: prev[airport.id] !== false ? false : true }))}
                        className="h-7 gap-1 text-xs text-muted-foreground"
                      >
                        {allSectionsExpanded[airport.id] !== false ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {allSectionsExpanded[airport.id] !== false ? "Collapse All" : "Expand All"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddSectionPicker(!showAddSectionPicker)}
                      className="h-7 gap-1 text-xs"
                    >
                      <Plus className="h-3 w-3" />
                      Add Section
                      {showAddSectionPicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                {/* Section type picker for adding */}
                {showAddSectionPicker && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-3 space-y-2.5">
                      <p className="text-xs font-medium">Choose a section type:</p>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Journey Flow</p>
                        <div className="grid gap-1">
                          {getJourneyTemplates(airport.id as any).map(t => {
                            const alreadyExists = template.sections.some(s =>
                              s.title.toLowerCase().includes(t.title.toLowerCase().split(" ")[0])
                            );
                            return (
                              <button
                                key={t.id}
                                onClick={() => {
                                  addSection(airport.id, t.defaultTitle);
                                  setShowAddSectionPicker(false);
                                }}
                                className={`flex items-center gap-2 p-2 rounded-md border text-left transition-colors ${
                                  alreadyExists
                                    ? "border-border/30 bg-muted/30 opacity-60"
                                    : "border-border/50 hover:bg-primary/10 hover:border-primary/30"
                                }`}
                              >
                                <span className="text-sm">{t.icon}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium">{t.title}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{t.description}</p>
                                </div>
                                {alreadyExists && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Added</Badge>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Situational</p>
                        <div className="grid gap-1">
                          {getSituationalTemplates(airport.id as any).map(t => (
                            <button
                              key={t.id}
                              onClick={() => {
                                addSection(airport.id, t.defaultTitle);
                                setShowAddSectionPicker(false);
                              }}
                              className="flex items-center gap-2 p-2 rounded-md border border-border/50 hover:bg-accent/10 hover:border-accent/30 transition-colors text-left"
                            >
                              <span className="text-sm">{t.icon}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium">{t.title}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{t.description}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          addSection(airport.id);
                          setShowAddSectionPicker(false);
                        }}
                        className="flex items-center gap-2 p-2 rounded-md border border-dashed border-border/50 hover:bg-muted/30 transition-colors text-left w-full"
                      >
                        <span className="text-sm">✏️</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium">Custom Section</p>
                          <p className="text-[10px] text-muted-foreground">Free-form content — no guided fields</p>
                        </div>
                      </button>
                    </CardContent>
                  </Card>
                )}

                {/* Section editors */}
                {template.sections.map((section, idx) => (
                  <GuidedSectionEditor
                    key={`${airport.id}-${idx}-${section.title}`}
                    airport={airport.id}
                    sectionIndex={idx}
                    sectionTitle={section.title}
                    sectionContent={section.content}
                    tone={aiTone}
                    context={aiContext}
                    onUpdate={(title, content) => {
                      const sections = [...template.sections];
                      sections[idx] = { title, content };
                      setTemplate(airport.id, { ...template, sections });
                    }}
                    onRemove={() => removeSection(airport.id, idx)}
                    onMoveUp={idx > 0 ? () => {
                      const sections = [...template.sections];
                      [sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]];
                      // Also update photo section_index references
                      const photos = template.photos.map(p => {
                        if (p.section_index === idx) return { ...p, section_index: idx - 1 };
                        if (p.section_index === idx - 1) return { ...p, section_index: idx };
                        return p;
                      });
                      setTemplate(airport.id, { ...template, sections, photos });
                    } : undefined}
                    onMoveDown={idx < template.sections.length - 1 ? () => {
                      const sections = [...template.sections];
                      [sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]];
                      const photos = template.photos.map(p => {
                        if (p.section_index === idx) return { ...p, section_index: idx + 1 };
                        if (p.section_index === idx + 1) return { ...p, section_index: idx };
                        return p;
                      });
                      setTemplate(airport.id, { ...template, sections, photos });
                    } : undefined}
                    totalSections={template.sections.length}
                    forceExpanded={allSectionsExpanded[airport.id]}
                    propertyId={activePropertyId}
                  />
                ))}

                {template.sections.length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-6 border border-dashed rounded-lg">
                    No sections yet. Click "Add Section" above to start building your guide, or use the AI Studio to generate a full draft.
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

              {/* Guest Preview */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="h-8 gap-1.5 text-xs w-full"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showPreview ? "Hide" : "Show"} Guest Preview
                  <Smartphone className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                </Button>

                {showPreview && (
                  <Card className="border-primary/30 overflow-hidden">
                    <div className="bg-primary/10 px-3 py-2 border-b border-primary/20 flex items-center gap-2">
                      <Smartphone className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">Guest View — {airport.label}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto border-primary/30 text-primary">
                        Preview
                      </Badge>
                    </div>
                    <CardContent className="p-0">
                      {/* Simulated phone frame */}
                      <div className="bg-background mx-auto max-w-sm">
                        <ScrollArea className="h-[480px]">
                          <div className="p-4 space-y-4">
                            {/* Dialog header simulation */}
                            <div className="flex items-center gap-2">
                              <div className="p-2 rounded-full bg-primary/10">
                                <Plane className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold">Welcome! 🎉</h3>
                                <p className="text-xs text-muted-foreground">
                                  Your arrival guide for {airport.label}
                                </p>
                              </div>
                            </div>

                            {/* Welcome message */}
                            {template.welcome_message && (
                              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                                <p className="text-sm font-medium leading-relaxed">
                                  {template.welcome_message}
                                </p>
                              </div>
                            )}

                            {/* Sections */}
                            {template.sections.map((section, idx) => {
                              const sPhotos = template.photos.filter(p => p.section_index === idx && p.url);
                              return (
                                <div key={idx} className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                      {idx + 1}
                                    </div>
                                    <h4 className="text-sm font-semibold">{section.title || `Section ${idx + 1}`}</h4>
                                  </div>
                                  <div className="pl-7">
                                    <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                                      {section.content || "(empty)"}
                                    </p>
                                    {sPhotos.length > 0 && (
                                      <div className="grid grid-cols-2 gap-2 mt-2">
                                        {sPhotos.map((photo, pi) => (
                                          <div key={pi} className="space-y-1">
                                            <img
                                              src={photo.url}
                                              alt={photo.alt || photo.caption || `Photo ${pi + 1}`}
                                              className="rounded-lg border object-cover aspect-video w-full"
                                            />
                                            {photo.caption && (
                                              <p className="text-[10px] text-muted-foreground italic text-center leading-tight px-1">
                                                {photo.caption}
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* General photos */}
                            {template.photos.filter(p => p.section_index === null && p.url).length > 0 && (
                              <>
                                <Separator />
                                <div className="grid grid-cols-2 gap-2">
                                  {template.photos.filter(p => p.section_index === null && p.url).map((photo, pi) => (
                                    <div key={pi} className="space-y-1">
                                      <img
                                        src={photo.url}
                                        alt={photo.alt || photo.caption || `Photo ${pi + 1}`}
                                        className="rounded-lg border object-cover aspect-video w-full"
                                      />
                                      {photo.caption && (
                                        <p className="text-[10px] text-muted-foreground italic text-center leading-tight px-1">
                                          {photo.caption}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            {template.sections.length === 0 && !template.welcome_message && (
                              <p className="text-sm text-muted-foreground italic text-center py-8">
                                No content yet — add sections and a welcome message above
                              </p>
                            )}

                            {/* CTA button simulation */}
                            <Button className="w-full gap-1.5 pointer-events-none">
                              <Check className="h-4 w-4" /> Got it, thanks!
                            </Button>
                          </div>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>
                )}
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
