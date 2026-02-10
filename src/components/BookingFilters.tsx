import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { STATE_LABELS, type BookingState } from "@/lib/bookingStateMachine";
import { Constants } from "@/integrations/supabase/types";
import type { Unit } from "@/hooks/useUnits";

interface BookingFiltersProps {
  state: BookingState | null;
  unitId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  units: Unit[];
  onStateChange: (s: BookingState | null) => void;
  onUnitChange: (id: string | null) => void;
  onDateFromChange: (d: string | null) => void;
  onDateToChange: (d: string | null) => void;
}

export function BookingFilters({
  state, unitId, dateFrom, dateTo, units,
  onStateChange, onUnitChange, onDateFromChange, onDateToChange,
}: BookingFiltersProps) {
  const hasFilters = state || unitId || dateFrom || dateTo;

  const clearAll = () => {
    onStateChange(null);
    onUnitChange(null);
    onDateFromChange(null);
    onDateToChange(null);
  };

  return (
    <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">State</label>
        <Select value={state ?? "all"} onValueChange={(v) => onStateChange(v === "all" ? null : v as BookingState)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {Constants.public.Enums.booking_state.map((s) => (
              <SelectItem key={s} value={s}>{STATE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Unit</label>
        <Select value={unitId ?? "all"} onValueChange={(v) => onUnitChange(v === "all" ? null : v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All units" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All units</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">From</label>
        <Input
          type="date"
          className="w-full sm:w-[150px]"
          value={dateFrom ?? ""}
          onChange={(e) => onDateFromChange(e.target.value || null)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">To</label>
        <Input
          type="date"
          className="w-full sm:w-[150px]"
          value={dateTo ?? ""}
          onChange={(e) => onDateToChange(e.target.value || null)}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-10">
          <X className="h-4 w-4 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
