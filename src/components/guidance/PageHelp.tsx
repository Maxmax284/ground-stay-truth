/**
 * PageHelp — small "?" icon in a page header. Opens a sheet with the page help,
 * detailed explanation, common tasks, step-by-step, and warnings from the
 * platform_guidance registry. Renders nothing if the caller's role is not
 * allowed or the entry does not exist yet.
 */
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useGuidance } from "@/hooks/useGuidance";

interface Props {
  guidanceKey: string;
  variant?: "icon" | "button";
}

const RISK_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/20 text-warning-foreground border-warning/40",
  high: "bg-destructive/15 text-destructive border-destructive/30",
};

export function PageHelp({ guidanceKey, variant = "icon" }: Props) {
  const { data } = useGuidance(guidanceKey);
  if (!data) return null;

  const steps = Array.isArray(data.step_by_step) ? data.step_by_step : [];

  return (
    <Sheet>
      <SheetTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" aria-label={`Help: ${data.feature_name}`}>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-2">
            <HelpCircle className="h-4 w-4" /> What is this page?
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle>{data.feature_name}</SheetTitle>
            <Badge className={`text-[10px] border ${RISK_TONE[data.risk_level] ?? ""}`}>
              {data.risk_level} risk
            </Badge>
          </div>
          {data.page_help && <SheetDescription>{data.page_help}</SheetDescription>}
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          {data.detailed_explanation && (
            <p className="text-foreground/90 leading-relaxed">{data.detailed_explanation}</p>
          )}

          {data.used_for.length > 0 && (
            <Section title="Use for">
              <ul className="list-disc pl-5 space-y-1">
                {data.used_for.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </Section>
          )}

          {data.not_used_for.length > 0 && (
            <Section title="Do not use for">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                {data.not_used_for.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </Section>
          )}

          {steps.length > 0 && (
            <Section title="Steps">
              <ol className="list-decimal pl-5 space-y-1">
                {steps.map((s, i) => <li key={i}>{s.step}</li>)}
              </ol>
            </Section>
          )}

          {data.warnings.length > 0 && (
            <Section title="Watch out">
              <ul className="list-disc pl-5 space-y-1 text-destructive">
                {data.warnings.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </Section>
          )}

          {data.related_keys.length > 0 && (
            <Section title="Related">
              <div className="flex flex-wrap gap-1.5">
                {data.related_keys.map((k) => (
                  <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                ))}
              </div>
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</h4>
      {children}
    </div>
  );
}
