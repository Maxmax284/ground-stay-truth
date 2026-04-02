import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Sparkles, Loader2, ChevronDown, ChevronUp, Info, Plus, X,
  FileText, Lightbulb, RefreshCw, BookOpen, Eye, EyeOff, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  type SectionTemplate, type SectionTypeId, type GuidedField,
  type AirportFacts,
  AIRPORT_FACTS, SECTION_TEMPLATES, getFactValue,
  getJourneyTemplates, getSituationalTemplates,
} from "@/lib/airportFactSheets";

interface FieldValues {
  [key: string]: string | string[];
}

interface Props {
  airport: string;
  sectionIndex: number;
  sectionTitle: string;
  sectionContent: string;
  tone: string;
  context: string;
  onUpdate: (title: string, content: string) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  totalSections: number;
  forceExpanded?: boolean;
  propertyId?: string | null;
}

/** Resolve a fact value into string or string[] for form display */
function resolveFactForField(facts: AirportFacts, field: GuidedField): string | string[] {
  if (!field.factPath) return field.type === "list" ? [] : "";
  const val = getFactValue(facts, field.factPath);
  if (val == null) return field.type === "list" ? [] : "";

  if (field.type === "list") {
    if (Array.isArray(val)) return val.map((v: any) => (typeof v === "string" ? v : JSON.stringify(v)));
    return [String(val)];
  }
  if (field.type === "transport_options") {
    // Return as stringified for display
    if (Array.isArray(val)) return val.map((v: any) => `${v.name}: ${v.cost} (${v.duration}) — ${v.notes}`);
    return [];
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/** Match existing section content to a template type by title similarity */
function detectSectionType(title: string, airport: string): SectionTypeId | null {
  const lower = title.toLowerCase();
  const checks: [string[], SectionTypeId][] = [
    [["immigration", "customs", "passport", "visa"], "immigration"],
    [["sim", "cash", "atm", "money", "exchange", "currency"], "sim_cash"],
    [["terminal", "navigat", "airport layout", "floor"], "terminal_navigation"],
    [["transport", "getting to", "taxi", "grab", "pickup", "how to get"], "transport"],
    [["route", "landmark", "on the way", "journey", "directions"], "route_to_camp"],
    [["first hour", "arrival", "check-in", "check in", "welcome", "settling"], "arrival_first_hour"],
    [["rain", "monsoon", "wet season"], "rainy_season"],
    [["late night", "night arrival", "after dark"], "late_night"],
    [["connect", "bkk to samui", "bangkok to", "domestic flight"], "bkk_connection"],
    [["first time", "thailand", "cultural", "culture"], "first_time_thailand"],
  ];
  for (const [keywords, id] of checks) {
    if (keywords.some(k => lower.includes(k))) {
      const tmpl = SECTION_TEMPLATES.find(t => t.id === id);
      if (tmpl && tmpl.airports.includes(airport as any)) return id;
    }
  }
  return null;
}

export function GuidedSectionEditor({
  airport, sectionIndex, sectionTitle, sectionContent, tone, context, onUpdate, onRemove, onMoveUp, onMoveDown, totalSections, forceExpanded, propertyId,
}: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const facts = AIRPORT_FACTS[airport];

  // Template detection
  const [selectedType, setSelectedType] = useState<SectionTypeId | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (forceExpanded !== undefined) setExpanded(forceExpanded);
  }, [forceExpanded]);

  const template = useMemo(() =>
    selectedType ? SECTION_TEMPLATES.find(t => t.id === selectedType) : null,
    [selectedType]
  );

  // Auto-detect section type from title on mount
  useEffect(() => {
    if (!selectedType && sectionTitle) {
      const detected = detectSectionType(sectionTitle, airport);
      if (detected) {
        setSelectedType(detected);
      }
    }
  }, []);

  // Pre-fill fields from airport facts when template changes
  useEffect(() => {
    if (!template || !facts) return;
    const prefilled: FieldValues = {};
    for (const field of template.guidedFields) {
      const existing = fieldValues[field.key];
      if (existing !== undefined && existing !== "" && !(Array.isArray(existing) && existing.length === 0)) {
        prefilled[field.key] = existing;
        continue;
      }
      prefilled[field.key] = resolveFactForField(facts, field);
    }
    setFieldValues(prefilled);
  }, [template?.id, airport]);

  const updateFieldValue = (key: string, value: string | string[]) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  };

  const addListItem = (key: string) => {
    const current = (fieldValues[key] as string[]) || [];
    updateFieldValue(key, [...current, ""]);
  };

  const updateListItem = (key: string, idx: number, value: string) => {
    const current = [...((fieldValues[key] as string[]) || [])];
    current[idx] = value;
    updateFieldValue(key, current);
  };

  const removeListItem = (key: string, idx: number) => {
    const current = [...((fieldValues[key] as string[]) || [])];
    current.splice(idx, 1);
    updateFieldValue(key, current);
  };

  // Generate content from structured fields using AI
  const handleGenerate = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/draft-arrival-welcome`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            airport,
            mode: "generate_section",
            tone,
            context,
            property_id: propertyId,
            section_type: selectedType || "custom",
            section_title: sectionTitle || template?.defaultTitle || "Custom Section",
            guided_fields: fieldValues,
            airport_facts: facts ? {
              code: facts.code,
              name: facts.name,
              type: facts.type,
            } : null,
          }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Generation failed");
      }
      const data = await resp.json();
      if (data.draft) {
        onUpdate(data.draft.title || sectionTitle, data.draft.content || sectionContent);
        toast({ title: "Section generated", description: "Review and edit the content below." });
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleRewrite = async () => {
    if (!session || !sectionContent) return;
    setGenerating(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/draft-arrival-welcome`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            airport,
            mode: "rewrite_section",
            tone,
            context,
            property_id: propertyId,
            section: { title: sectionTitle, content: sectionContent },
            guided_fields: fieldValues,
          }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Rewrite failed");
      }
      const { draft } = await resp.json();
      if (draft) {
        onUpdate(draft.title || sectionTitle, draft.content || sectionContent);
        toast({ title: "Section rewritten" });
      }
    } catch (err: any) {
      toast({ title: "Rewrite failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const journeyTemplates = getJourneyTemplates(airport as any);
  const situationalTemplates = getSituationalTemplates(airport as any);

  return (
    <Card className={`border-border/50 ${template ? "border-l-2 border-l-primary/40" : ""}`}>
      <CardContent className="p-0">
        {/* Header */}
        <div
          className="p-3 flex items-center gap-2 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-base">{template?.icon || "📄"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {sectionTitle || template?.defaultTitle || `Section ${sectionIndex + 1}`}
              </span>
              {template && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary shrink-0">
                  {template.category === "journey" ? "Journey" : template.category === "situational" ? "Situational" : "Custom"}
                </Badge>
              )}
            </div>
            {template && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{template.description}</p>
            )}
          </div>
          {/* Reorder + remove buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
              disabled={!onMoveUp}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Move up"
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
              disabled={!onMoveDown}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Move down"
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Badge variant="secondary" className="text-[9px] px-1 py-0 mx-0.5">
              {sectionIndex + 1}/{totalSections}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>

        {expanded && (
          <div className="px-3 pb-3 space-y-3">
            <Separator />

            {/* Section type picker */}
            {!selectedType && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTypePicker(!showTypePicker)}
                  className="h-8 gap-1.5 text-xs w-full justify-start"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-primary" />
                  Choose a section type for guided editing
                  {showTypePicker ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                </Button>
                {showTypePicker && (
                  <div className="space-y-2 pl-1">
                    {/* Journey */}
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Journey Flow</p>
                    <div className="grid gap-1.5">
                      {journeyTemplates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedType(t.id); setShowTypePicker(false); }}
                          className="flex items-center gap-2 p-2 rounded-md border border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-colors text-left"
                        >
                          <span className="text-sm">{t.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{t.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{t.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {/* Situational */}
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3">Situational</p>
                    <div className="grid gap-1.5">
                      {situationalTemplates.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedType(t.id); setShowTypePicker(false); }}
                          className="flex items-center gap-2 p-2 rounded-md border border-border/50 hover:bg-accent/5 hover:border-accent/30 transition-colors text-left"
                        >
                          <span className="text-sm">{t.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{t.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{t.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {/* Custom */}
                    <button
                      onClick={() => { setSelectedType("custom"); setShowTypePicker(false); }}
                      className="flex items-center gap-2 p-2 rounded-md border border-dashed border-border/50 hover:bg-muted/30 transition-colors text-left w-full mt-2"
                    >
                      <span className="text-sm">✏️</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Custom Section</p>
                        <p className="text-[10px] text-muted-foreground">Free-form content</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Type badge + change button */}
            {selectedType && selectedType !== "custom" && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs gap-1 border-primary/30">
                  <span>{template?.icon}</span> {template?.title}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedType(null); setShowTypePicker(true); }}
                  className="h-6 text-[10px] text-muted-foreground"
                >
                  Change type
                </Button>
                {facts && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFacts(!showFacts)}
                    className="h-6 text-[10px] text-muted-foreground gap-1 ml-auto"
                  >
                    {showFacts ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showFacts ? "Hide" : "Show"} reference data
                  </Button>
                )}
              </div>
            )}

            {/* Airport reference facts (collapsible) */}
            {showFacts && template && facts && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      {facts.fullName} — Reference Data
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground space-y-1">
                    {template.guidedFields.filter(f => f.factPath).map(f => {
                      const val = getFactValue(facts, f.factPath!);
                      if (!val) return null;
                      return (
                        <div key={f.key} className="flex gap-2">
                          <span className="font-medium text-foreground/80 shrink-0">{f.label}:</span>
                          <span className="truncate">
                            {Array.isArray(val) ? val.map((v: any) => typeof v === "string" ? v : v.name || JSON.stringify(v)).join(", ") : String(val)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Guided fields */}
            {template && template.id !== "custom" && (
              <div className="space-y-2.5">
                {template.guidedFields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
                    {field.helpText && <p className="text-[10px] text-muted-foreground/70">{field.helpText}</p>}

                    {field.type === "text" && (
                      <Input
                        value={(fieldValues[field.key] as string) || ""}
                        onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        placeholder={field.placeholder || ""}
                        className="h-8 text-xs"
                      />
                    )}

                    {field.type === "textarea" && (
                      <Textarea
                        value={(fieldValues[field.key] as string) || ""}
                        onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        placeholder={field.placeholder || ""}
                        rows={2}
                        className="text-xs"
                      />
                    )}

                    {(field.type === "list" || field.type === "transport_options") && (
                      <div className="space-y-1">
                        {((fieldValues[field.key] as string[]) || []).map((item, idx) => (
                          <div key={idx} className="flex gap-1.5">
                            <Input
                              value={item}
                              onChange={(e) => updateListItem(field.key, idx, e.target.value)}
                              placeholder={field.placeholder || `Item ${idx + 1}`}
                              className="h-7 text-xs flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeListItem(field.key, idx)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addListItem(field.key)}
                          className="h-6 gap-1 text-[10px] text-muted-foreground"
                        >
                          <Plus className="h-3 w-3" /> Add item
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                <Separator />
              </div>
            )}

            {/* Title input */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Section Title</Label>
              <Input
                value={sectionTitle}
                onChange={(e) => onUpdate(e.target.value, sectionContent)}
                placeholder={template?.defaultTitle || "Section title"}
                className="h-8 text-sm font-medium"
              />
            </div>

            {/* AI generate / rewrite buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="h-8 gap-1.5 text-xs flex-1"
              >
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
                {sectionContent ? "Re-generate from fields" : "Generate from fields"}
              </Button>
              {sectionContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRewrite}
                  disabled={generating}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Polish
                </Button>
              )}
            </div>

            {/* Content editor */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-muted-foreground" />
                Content
                {sectionContent && (
                  <span className="text-[10px] text-muted-foreground font-normal ml-auto">
                    {sectionContent.length} chars
                  </span>
                )}
              </Label>
              <Textarea
                value={sectionContent}
                onChange={(e) => onUpdate(sectionTitle, e.target.value)}
                placeholder="Content will appear here after generation, or write your own..."
                rows={6}
                className="text-sm"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
