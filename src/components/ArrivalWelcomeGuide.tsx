import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plane, MapPin, CheckCircle2, ChevronRight } from "lucide-react";
import { usePolicySettings } from "@/hooks/usePolicySettings";

interface WelcomePhoto {
  url: string;
  caption: string;
  alt: string;
  section_index: number | null;
  tag: string;
}

interface WelcomeSection {
  title: string;
  content: string;
}

interface WelcomeTemplate {
  welcome_message: string;
  sections: WelcomeSection[];
  photos: WelcomePhoto[];
  enabled: boolean;
}

/** Migrate old flat string[] photos to new format */
function migratePhotos(photos: unknown): WelcomePhoto[] {
  if (!Array.isArray(photos)) return [];
  return photos.map((p: any) => {
    if (typeof p === "string") {
      return { url: p, caption: "", alt: "", section_index: null, tag: "other" };
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

function parseTemplate(value: unknown): WelcomeTemplate | null {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(String(value)) : value;
    return {
      welcome_message: parsed.welcome_message || "",
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      photos: migratePhotos(parsed.photos),
      enabled: parsed.enabled !== false,
    };
  } catch {
    return null;
  }
}

/** Detect airport from arrival details or flight number */
export function detectAirport(booking: any): "bkk" | "samui" | null {
  const details = booking?.arrival_details;
  if (typeof details === "object" && details !== null) {
    const airport = (details as any).airport || (details as any).arrival_airport;
    if (typeof airport === "string") {
      const lower = airport.toLowerCase();
      if (lower.includes("bkk") || lower.includes("suvarnabhumi")) return "bkk";
      if (lower.includes("samui") || lower.includes("usm")) return "samui";
    }
  }
  return null;
}

function SectionPhotos({ photos }: { photos: WelcomePhoto[] }) {
  if (!photos.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {photos.map((photo, idx) => (
        <div key={idx} className="space-y-1">
          <img
            src={photo.url}
            alt={photo.alt || photo.caption || `Reference ${idx + 1}`}
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
  );
}

function WelcomeContent({ template }: { template: WelcomeTemplate }) {
  const photosForSection = (idx: number) =>
    template.photos.filter((p) => p.section_index === idx && p.url);
  const generalPhotos = template.photos.filter((p) => p.section_index === null && p.url);

  return (
    <div className="space-y-4">
      {/* Welcome message */}
      {template.welcome_message && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <p className="text-sm font-medium text-foreground leading-relaxed">
            {template.welcome_message}
          </p>
        </div>
      )}

      {/* Sections with inline photos */}
      {template.sections.map((section, idx) => {
        const sPhotos = photosForSection(idx);
        return (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {idx + 1}
              </div>
              <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
            </div>
            <div className="pl-7">
              <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                {section.content}
              </p>
              <SectionPhotos photos={sPhotos} />
            </div>
          </div>
        );
      })}

      {/* General (unlinked) photos */}
      {generalPhotos.length > 0 && (
        <>
          <Separator />
          <SectionPhotos photos={generalPhotos} />
        </>
      )}
    </div>
  );
}

/* ── Welcome Dialog (shown after landing confirmation) ── */

interface ArrivalWelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  airport: "bkk" | "samui" | null;
}

export function ArrivalWelcomeDialog({ open, onOpenChange, airport }: ArrivalWelcomeDialogProps) {
  const { data: settings } = usePolicySettings();

  const template = useMemo(() => {
    if (!airport || !settings) return null;
    const setting = settings.find((s) => s.key === `arrival_welcome_${airport}`);
    return parseTemplate(setting?.value);
  }, [airport, settings]);

  const airportLabel = airport === "bkk" ? "BKK (Suvarnabhumi)" : "Samui (USM)";
  const guideEnabled = template?.enabled ?? false;
  const hasContent = guideEnabled && (template?.welcome_message || (template?.sections?.length ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Plane className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                {hasContent ? "Welcome! 🎉" : "Landing Confirmed! ✅"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {hasContent
                  ? `Your arrival guide for ${airportLabel}`
                  : `You've confirmed your arrival at ${airportLabel}. Your driver has been notified!`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {hasContent && template && (
          <ScrollArea className="max-h-[60vh] px-5 pb-5">
            <WelcomeContent template={template} />
          </ScrollArea>
        )}
        {!hasContent && (
          <div className="px-5 pb-2">
            <p className="text-sm text-muted-foreground">
              Sit tight — your driver is on the way. If you need anything, tap "Ask Kru Glitch" in the portal.
            </p>
          </div>
        )}
        <div className="px-5 pb-5">
          <Button onClick={() => onOpenChange(false)} className="w-full gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Got it, thanks!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Inline Welcome Card (persistent in guest portal) ── */

interface ArrivalWelcomeCardProps {
  airport: "bkk" | "samui" | null;
  compact?: boolean;
}

export function ArrivalWelcomeCard({ airport, compact = false }: ArrivalWelcomeCardProps) {
  const { data: settings } = usePolicySettings();

  const template = useMemo(() => {
    if (!airport || !settings) return null;
    const setting = settings.find((s) => s.key === `arrival_welcome_${airport}`);
    return parseTemplate(setting?.value);
  }, [airport, settings]);

  if (!template || !template.enabled) return null;

  if (compact) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground">Arrival Guide</span>
            <Badge variant="secondary" className="text-[10px] ml-auto">
              {airport?.toUpperCase()}
            </Badge>
          </div>
          {template.welcome_message && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {template.welcome_message}
            </p>
          )}
          {template.sections.length > 0 && (
            <div className="space-y-1">
              {template.sections.slice(0, 2).map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-foreground">
                  <ChevronRight className="h-3 w-3 text-primary shrink-0" />
                  <span className="font-medium">{s.title}</span>
                </div>
              ))}
              {template.sections.length > 2 && (
                <p className="text-[10px] text-muted-foreground pl-[18px]">
                  +{template.sections.length - 2} more sections
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">Your Arrival Guide</span>
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {airport?.toUpperCase()}
          </Badge>
        </div>
        <WelcomeContent template={template} />
      </CardContent>
    </Card>
  );
}
