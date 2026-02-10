import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { type BookingState } from "@/lib/bookingStateMachine";
import { Constants } from "@/integrations/supabase/types";
import type { Unit } from "@/hooks/useUnits";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        <label className="text-xs font-medium text-muted-foreground">{t("filters.state")}</label>
        <Select value={state ?? "all"} onValueChange={(v) => onStateChange(v === "all" ? null : v as BookingState)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder={t("filters.allStates")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allStates")}</SelectItem>
            {Constants.public.Enums.booking_state.map((s) => (
              <SelectItem key={s} value={s}>{t(`states.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("filters.unit")}</label>
        <Select value={unitId ?? "all"} onValueChange={(v) => onUnitChange(v === "all" ? null : v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t("filters.allUnits")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allUnits")}</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("filters.from")}</label>
        <Input
          type="date"
          className="w-full sm:w-[150px]"
          value={dateFrom ?? ""}
          onChange={(e) => onDateFromChange(e.target.value || null)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("filters.to")}</label>
        <Input
          type="date"
          className="w-full sm:w-[150px]"
          value={dateTo ?? ""}
          onChange={(e) => onDateToChange(e.target.value || null)}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-10">
          <X className="h-4 w-4 mr-1" /> {t("common.clear")}
        </Button>
      )}
    </div>
  );
}
