import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Sparkles, Loader2, CloudRain, Car, UserCheck, Scissors, Globe, Lightbulb, Wand2, Zap,
} from "lucide-react";
import type { WelcomeTemplate } from "./ArrivalWelcomeEditor";

const QUICK_ACTIONS = [
  {
    id: "rainy",
    label: "Rainy Season",
    icon: CloudRain,
    context: "Include rainy season tips: pack a light rain jacket, roads may flood briefly, grab an umbrella at 7-Eleven.",
    color: "text-blue-500",
  },
  {
    id: "transport",
    label: "Transport Focus",
    icon: Car,
    context: "Emphasize transportation details: taxi vs. private transfer, approximate costs in THB, what to tell the driver, Grab app tips.",
    color: "text-emerald-500",
  },
  {
    id: "first-timer",
    label: "First-Timer",
    icon: UserCheck,
    context: "This is for first-time visitors to Thailand. Cover: SIM cards, money exchange, basic Thai phrases, what to expect at the camp.",
    color: "text-amber-500",
  },
  {
    id: "shorten",
    label: "Make Shorter",
    icon: Scissors,
    context: "Condense all existing content to be more concise. Cut fluff, keep actionable steps only. Maximum 2-3 sentences per section.",
    color: "text-rose-500",
  },
  {
    id: "multilingual",
    label: "Multi-Lingual Notes",
    icon: Globe,
    context: "Add brief Thai translations for key phrases guests might need: 'take me to Lamai', 'how much?', 'thank you'. Include phonetic pronunciation.",
    color: "text-violet-500",
  },
] as const;

const TONES = [
  { id: "friendly", label: "Friendly", emoji: "😊" },
  { id: "professional", label: "Professional", emoji: "👔" },
  { id: "casual", label: "Casual", emoji: "🤙" },
  { id: "minimal", label: "Minimal", emoji: "📋" },
] as const;

interface Props {
  airport: string;
  airportLabel: string;
  template: WelcomeTemplate;
  tone: string;
  onToneChange: (tone: string) => void;
  context: string;
  onContextChange: (ctx: string) => void;
  onDraftGenerated: (draft: { welcome_message?: string; sections?: any[] }) => void;
  onSuggestionsReceived: (suggestions: any[]) => void;
  drafting: boolean;
  setDrafting: (v: boolean) => void;
  propertyId?: string | null;
}

export function AIStudioPanel({
  airport, airportLabel, template, tone, onToneChange,
  context, onContextChange, onDraftGenerated, onSuggestionsReceived,
  drafting, setDrafting, propertyId,
}: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [suggesting, setSuggesting] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);

  const callDraft = async (overrideContext?: string) => {
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
          body: JSON.stringify({
            airport,
            context: overrideContext || context,
            tone,
          }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "AI draft failed");
      }
      const { draft } = await resp.json();
      onDraftGenerated(draft);
      toast({ title: "Draft ready", description: "Review and edit, then save." });
    } catch (err: any) {
      toast({ title: "Draft Failed", description: err.message, variant: "destructive" });
    } finally {
      setDrafting(false);
      setActiveQuickAction(null);
    }
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[number]) => {
    setActiveQuickAction(action.id);
    const combinedContext = context ? `${context}. ${action.context}` : action.context;
    callDraft(combinedContext);
  };

  const handleSuggestSections = async () => {
    setSuggesting(true);
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
            mode: "suggest_sections",
            tone,
            context,
            current_template: {
              sections: template.sections,
            },
          }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Suggestion failed");
      }
      const { suggestions } = await resp.json();
      onSuggestionsReceived(suggestions || []);
    } catch (err: any) {
      toast({ title: "Suggestions Failed", description: err.message, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  const isWorking = drafting || suggesting;

  return (
    <Card className="border-primary/30 overflow-hidden">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 px-4 py-3 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
            <Wand2 className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">AI Content Studio</h3>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary font-normal">
                {airportLabel}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Generate, refine, and iterate on your arrival guide with AI
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Tone selector */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tone</p>
          <div className="flex gap-1.5 flex-wrap">
            {TONES.map((t) => (
              <Button
                key={t.id}
                variant={tone === t.id ? "default" : "outline"}
                size="sm"
                onClick={() => onToneChange(t.id)}
                className={`h-7 text-xs gap-1 ${tone === t.id ? "" : "border-border/60"}`}
                disabled={isWorking}
              >
                <span>{t.emoji}</span> {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Context input */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Extra Context</p>
          <Input
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            placeholder="e.g., 'mention the new gym entrance', 'focus on Samui ferry info'"
            className="h-9 text-sm"
            disabled={isWorking}
          />
        </div>

        {/* Quick actions */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Presets</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              const isActive = activeQuickAction === action.id;
              return (
                <Button
                  key={action.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAction(action)}
                  disabled={isWorking}
                  className={`h-auto py-2 px-2.5 flex-col items-start gap-1 text-left border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all ${
                    isActive ? "border-primary/50 bg-primary/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    {isActive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                    ) : (
                      <Icon className={`h-3.5 w-3.5 ${action.color} shrink-0`} />
                    )}
                    <span className="text-xs font-medium truncate">{action.label}</span>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Main actions */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => callDraft()}
            disabled={isWorking}
            className="flex-1 gap-1.5 h-10"
          >
            {drafting && !activeQuickAction ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Full Draft
          </Button>
          <Button
            variant="outline"
            onClick={handleSuggestSections}
            disabled={isWorking}
            className="gap-1.5 h-10 border-primary/30 text-primary hover:bg-primary/5"
          >
            {suggesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lightbulb className="h-4 w-4" />
            )}
            Suggest Sections
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
