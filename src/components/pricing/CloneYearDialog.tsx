import { useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePricingRules } from "@/hooks/usePricingRules";
import { bumpStayCacheVersion } from "@/lib/stayCacheBust";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Bulk-clone every pricing rule from a source year into a target year.
 * Shifts start/end dates by the year delta. Skips any rule whose new
 * date range would overlap an existing rule on the same unit.
 */
export function CloneYearDialog() {
  const { data: rules } = usePricingRules();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sourceYear, setSourceYear] = useState<string>("");
  const [targetYear, setTargetYear] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const availableYears = useMemo(() => {
    if (!rules) return [];
    const years = new Set<number>();
    rules.forEach((r) => years.add(new Date(r.start_date).getFullYear()));
    return Array.from(years).sort();
  }, [rules]);

  const nextYear = new Date().getFullYear() + 1;
  const targetOptions = useMemo(() => {
    const base = new Date().getFullYear();
    return [base, base + 1, base + 2, base + 3];
  }, []);

  const sourceRules = useMemo(() => {
    if (!rules || !sourceYear) return [];
    return rules.filter(
      (r) => new Date(r.start_date).getFullYear() === Number(sourceYear)
    );
  }, [rules, sourceYear]);

  // Auto-select all when source changes
  const handleSourceChange = (v: string) => {
    setSourceYear(v);
    const initial: Record<string, boolean> = {};
    (rules ?? [])
      .filter((r) => new Date(r.start_date).getFullYear() === Number(v))
      .forEach((r) => (initial[r.id] = true));
    setSelected(initial);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleClone = async () => {
    if (!sourceYear || !targetYear || selectedCount === 0) return;
    const delta = Number(targetYear) - Number(sourceYear);
    if (delta === 0) {
      toast({ title: "Source and target year must differ", variant: "destructive" });
      return;
    }

    setBusy(true);
    let created = 0;
    let skipped = 0;
    const skipReasons: string[] = [];

    try {
      for (const r of sourceRules) {
        if (!selected[r.id]) continue;
        const start = new Date(r.start_date);
        const end = new Date(r.end_date);
        start.setFullYear(start.getFullYear() + delta);
        end.setFullYear(end.getFullYear() + delta);
        const newStart = start.toISOString().split("T")[0];
        const newEnd = end.toISOString().split("T")[0];

        // Overlap check
        const { data: existing } = await supabase
          .from("pricing_rules")
          .select("id, name")
          .eq("unit_id", r.unit_id)
          .lte("start_date", newEnd)
          .gte("end_date", newStart);

        if (existing && existing.length > 0) {
          skipped++;
          skipReasons.push(`"${r.name}" (overlaps "${existing[0].name}")`);
          continue;
        }

        const { error } = await supabase.from("pricing_rules").insert({
          name: r.name.replace(String(sourceYear), String(targetYear)) ||
            `${r.name} (${targetYear})`,
          unit_id: r.unit_id,
          start_date: newStart,
          end_date: newEnd,
          price: r.price,
          weekend_price: r.weekend_price,
          adjustment_type: (r as any).adjustment_type ?? "absolute",
          adjustment_value: (r as any).adjustment_value,
          min_nights: (r as any).min_nights,
        });

        if (error) {
          skipped++;
          skipReasons.push(`"${r.name}" (${error.message})`);
        } else {
          created++;
        }
      }

      qc.invalidateQueries({ queryKey: ["pricing_rules"] });
      bumpStayCacheVersion("pricing_year_cloned");

      toast({
        title: `Cloned ${created} rule${created === 1 ? "" : "s"} to ${targetYear}`,
        description:
          skipped > 0
            ? `Skipped ${skipped}: ${skipReasons.slice(0, 3).join(", ")}${skipReasons.length > 3 ? "…" : ""}`
            : "All selected rules duplicated with year shifted.",
      });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Clone failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Copy className="h-4 w-4 mr-1.5" />
          Clone Year
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Clone Pricing Rules to Another Year</DialogTitle>
          <DialogDescription>
            Duplicate every seasonal rule from one year into another with the dates
            shifted. Overlaps with existing rules are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <Label>From year</Label>
            <Select value={sourceYear} onValueChange={handleSourceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pick source" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To year</Label>
            <Select value={targetYear} onValueChange={setTargetYear}>
              <SelectTrigger>
                <SelectValue placeholder={`e.g. ${nextYear}`} />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {sourceRules.length > 0 && (
          <div className="space-y-2 pt-2 min-h-0 flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between">
              <Label>Rules to clone ({selectedCount} of {sourceRules.length})</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const all = selectedCount === sourceRules.length;
                  const next: Record<string, boolean> = {};
                  sourceRules.forEach((r) => (next[r.id] = !all));
                  setSelected(next);
                }}
              >
                {selectedCount === sourceRules.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <ScrollArea className="rounded-md border flex-1 min-h-0">
              <div className="p-2 space-y-1">
                {sourceRules.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 rounded-sm p-2 text-sm hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={!!selected[r.id]}
                      onCheckedChange={(v) =>
                        setSelected((s) => ({ ...s, [r.id]: !!v }))
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.units?.name ?? "—"} · {r.start_date} → {r.end_date}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {sourceYear && sourceRules.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rules found for {sourceYear}.
          </p>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleClone}
            disabled={!sourceYear || !targetYear || selectedCount === 0 || busy}
          >
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Clone {selectedCount} rule{selectedCount === 1 ? "" : "s"}
            {targetYear ? ` → ${targetYear}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
