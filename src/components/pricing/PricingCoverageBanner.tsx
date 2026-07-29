import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useUnits } from "@/hooks/useUnits";
import { usePricingRules } from "@/hooks/usePricingRules";

/**
 * Warns admins when active units have no seasonal pricing rules covering
 * the next 90 days. Prevents the "No rooms available" / wrong-rate silent
 * failure Nikki hit when 2027 rules were missing.
 */
export function PricingCoverageBanner() {
  const { data: units } = useUnits();
  const { data: rules } = usePricingRules();

  const gaps = useMemo(() => {
    if (!units || !rules) return [];
    const today = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 90);
    const horizonISO = horizon.toISOString().split("T")[0];
    const todayISO = today.toISOString().split("T")[0];

    return units
      .filter((u) => u.is_active)
      .filter((u) => {
        // A unit is covered by its own override rules OR by a rule on its
        // room type — group rules apply to every room in the group.
        const unitRules = getRulesForUnit(rules, u as any);
        const covered = unitRules.some(
          (r) => r.start_date <= horizonISO && r.end_date >= todayISO
        );
        return !covered;
      })
      .map((u) => u.name);

  }, [units, rules]);

  if (gaps.length === 0) return null;

  return (
    <Alert variant="destructive" className="border-2">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Pricing coverage gap — next 90 days</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p className="text-sm">
          {gaps.length} active {gaps.length === 1 ? "unit has" : "units have"} no
          seasonal pricing rule covering the next 90 days. Guests may see wrong
          rates or "No rooms available" for that window.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {gaps.map((name) => (
            <Badge key={name} variant="outline" className="bg-background/50">
              {name}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Fix: add a rule below, or use <strong>Clone Year</strong> to duplicate
          an existing season into the missing year.
        </p>
      </AlertDescription>
    </Alert>
  );
}
