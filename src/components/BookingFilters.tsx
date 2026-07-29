import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { X, AlertTriangle } from "lucide-react";
import { type BookingState } from "@/lib/bookingStateMachine";
import { Constants } from "@/integrations/supabase/types";
import type { Unit } from "@/hooks/useUnits";
import { useTranslation } from "react-i18next";

export type BookingSort = "check_in_asc" | "check_in_desc" | "created_desc" | "guest_asc" | "unit_asc";

export const BOOKING_SORT_OPTIONS: { value: BookingSort; labelKey: string }[] = [
  { value: "check_in_asc", labelKey: "filters.sortCheckInSoonest" },
  { value: "check_in_desc", labelKey: "filters.sortCheckInLatest" },
  { value: "created_desc", labelKey: "filters.sortNewest" },
  { value: "guest_asc", labelKey: "filters.sortGuestAZ" },
  { value: "unit_asc", labelKey: "filters.sortUnitAZ" },
];

interface BookingFiltersProps {
  state: BookingState | null;
  unitId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  units: Unit[];
  sort: BookingSort;
  showCancelled: boolean;
  /** Show only bookings whose hold / deposit clock has run out. */
  expiredOnly: boolean;
  expiredCount: number;
  onStateChange: (s: BookingState | null) => void;
  onUnitChange: (id: string | null) => void;
  onDateFromChange: (d: string | null) => void;
  onDateToChange: (d: string | null) => void;
  onSortChange: (s: BookingSort) => void;
  onShowCancelledChange: (v: boolean) => void;
  onExpiredOnlyChange: (v: boolean) => void;
}

export function BookingFilters({
  state, unitId, dateFrom, dateTo, units, sort, showCancelled, expiredOnly, expiredCount,
  onStateChange, onUnitChange, onDateFromChange, onDateToChange, onSortChange, onShowCancelledChange,
  onExpiredOnlyChange,
}: BookingFiltersProps) {
  const { t } = useTranslation();
  const hasFilters = state || unitId || dateFrom || dateTo || sort !== "check_in_asc" || showCancelled || expiredOnly;

  const clearAll = () => {
    onStateChange(null);
    onUnitChange(null);
    onDateFromChange(null);
    onDateToChange(null);
    onSortChange("check_in_asc");
    onShowCancelledChange(false);
    onExpiredOnlyChange(false);
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

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("filters.sort")}</label>
        <Select value={sort} onValueChange={(v) => onSortChange(v as BookingSort)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOOKING_SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 h-10">
        <Button
          type="button"
          size="sm"
          variant={expiredOnly ? "destructive" : "outline"}
          onClick={() => onExpiredOnlyChange(!expiredOnly)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Expired only{expiredCount > 0 ? ` (${expiredCount})` : ""}
        </Button>
      </div>

      <div className="flex items-center gap-2 h-10">
        <Switch id="show-cancelled" checked={showCancelled} onCheckedChange={onShowCancelledChange} />
        <label htmlFor="show-cancelled" className="text-xs font-medium text-muted-foreground cursor-pointer">
          {t("filters.showCancelled")}
        </label>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-10">
          <X className="h-4 w-4 mr-1" /> {t("common.clear")}
        </Button>
      )}
    </div>
  );
}
