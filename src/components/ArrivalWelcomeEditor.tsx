import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Plane, Save, Plus, X, Sparkles, Loader2, GripVertical, Image as ImageIcon, MapPin,
} from "lucide-react";

interface WelcomeSection {
  title: string;
  content: string;
}

interface WelcomeTemplate {
  welcome_message: string;
  sections: WelcomeSection[];
  photos: string[];
}

const AIRPORTS = [
  { id: "bkk", label: "BKK (Suvarnabhumi)", icon: "✈️" },
  { id: "samui", label: "Samui (USM)", icon: "🌴" },
] as const;

const DEFAULT_TEMPLATE: WelcomeTemplate = {
  welcome_message: "",
  sections: [],
  photos: [],
};

function parseTemplate(value: unknown): WelcomeTemplate {
  if (!value) return { ...DEFAULT_TEMPLATE };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return {
      welcome_message: parsed.welcome_message || "",
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
    };
  } catch {
    return { ...DEFAULT_TEMPLATE };
  }
}

export function ArrivalWelcomeEditor() {
  const { data: settings } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const { session } = useAuth();
  const [activeAirport, setActiveAirport] = useState<string>("bkk");
  const [drafting, setDrafting] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [localEdits, setLocalEdits] = useState<Record<string, WelcomeTemplate>>({});

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
    setTemplate(airport, {
      ...current,
      sections: current.sections.filter((_, i) => i !== idx),
    });
  };

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

  const handleAIDraft = async (airport: string) => {
    setDrafting(true);
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
          body: JSON.stringify({ airport, context: aiContext }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "AI draft failed");
      }
      const { draft } = await resp.json();
      const current = getTemplate(airport);
      setTemplate(airport, {
        ...current,
        welcome_message: draft.welcome_message || current.welcome_message,
        sections: draft.sections || current.sections,
      });
      toast({ title: "AI Draft Ready", description: "Review and edit the generated content, then save." });
    } catch (err: any) {
      toast({ title: "AI Draft Failed", description: err.message, variant: "destructive" });
    } finally {
      setDrafting(false);
    }
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

      <Tabs value={activeAirport} onValueChange={setActiveAirport}>
        <TabsList className="bg-muted/50">
          {AIRPORTS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="gap-1.5">
              <span>{a.icon}</span>
              {a.label}
              {isDirty(a.id) && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">unsaved</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>

        {AIRPORTS.map((airport) => {
          const template = getTemplate(airport.id);
          return (
            <TabsContent key={airport.id} value={airport.id} className="space-y-4 mt-3">
              {/* AI Draft Section */}
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">AI Draft Assistant</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Let AI generate a starting draft for the {airport.label} arrival guide. You can edit everything after.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                      placeholder="Optional context (e.g., 'mention the new gym entrance', 'include taxi backup option')"
                      className="h-9 text-sm"
                    />
                    <Button
                      onClick={() => handleAIDraft(airport.id)}
                      disabled={drafting}
                      size="sm"
                      className="h-9 gap-1.5 shrink-0"
                    >
                      {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {drafting ? "Drafting..." : "Generate Draft"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

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

                {template.sections.map((section, idx) => (
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
                    </CardContent>
                  </Card>
                ))}

                {template.sections.length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-4 border border-dashed rounded-lg">
                    No sections yet. Add one or use AI to generate a draft.
                  </p>
                )}
              </div>

              {/* Photo URLs */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Reference Photos
                </Label>
                <p className="text-xs text-muted-foreground">
                  Add photo URLs that will be shown in the arrival guide (e.g., signs, meeting points, landmarks).
                </p>
                {template.photos.map((url, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    {url && (
                      <img src={url} alt={`Photo ${idx + 1}`} className="h-10 w-10 rounded object-cover border shrink-0" />
                    )}
                    <Input
                      value={url}
                      onChange={(e) => {
                        const photos = [...template.photos];
                        photos[idx] = e.target.value;
                        updateField(airport.id, "photos", photos);
                      }}
                      placeholder="https://example.com/photo.jpg"
                      className="h-9 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        updateField(airport.id, "photos", template.photos.filter((_, i) => i !== idx));
                      }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateField(airport.id, "photos", [...template.photos, ""])}
                  className="h-7 gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" /> Add Photo URL
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
