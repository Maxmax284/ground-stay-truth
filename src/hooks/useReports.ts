import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, subMonths, differenceInDays } from "date-fns";
import { BLOCKING_STATES, type BookingState } from "@/lib/bookingStateMachine";

export function useReports(monthOffset = 0) {
  const refDate = subMonths(new Date(), monthOffset);
  const rangeStart = format(startOfMonth(refDate), "yyyy-MM-dd");
  const rangeEnd = format(endOfMonth(refDate), "yyyy-MM-dd");

  const bookings = useQuery({
    queryKey: ["reports", "bookings", rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, unit_id, check_in, check_out, state, total_price, price_override, units(name)")
        .lte("check_in", rangeEnd)
        .gte("check_out", rangeStart);
      if (error) throw error;
      return data;
    },
  });

  const units = useQuery({
    queryKey: ["reports", "units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name, base_price")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const maintenanceBlocks = useQuery({
    queryKey: ["reports", "maintenance_blocks", rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_blocks")
        .select("id, unit_id, start_date, end_date")
        .lte("start_date", rangeEnd)
        .gte("end_date", rangeStart);
      if (error) throw error;
      return data;
    },
  });

  // Derived: occupancy per day
  const daysInRange = eachDayOfInterval({ start: startOfMonth(refDate), end: endOfMonth(refDate) });
  const totalUnitDays = (units.data?.length ?? 1) * daysInRange.length;

  const occupancyByDay = daysInRange.map((day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    const occupied = (bookings.data ?? []).filter(
      (b) =>
        BLOCKING_STATES.includes(b.state as BookingState) &&
        b.check_in <= dayStr &&
        b.check_out > dayStr
    ).length;
    return { date: format(day, "MMM d"), occupied, total: units.data?.length ?? 0 };
  });

  const totalOccupiedDays = occupancyByDay.reduce((s, d) => s + d.occupied, 0);
  const occupancyRate = totalUnitDays > 0 ? Math.round((totalOccupiedDays / totalUnitDays) * 100) : 0;

  // Derived: revenue per unit
  const revenueByUnit = (units.data ?? []).map((unit) => {
    const unitBookings = (bookings.data ?? []).filter((b) => b.unit_id === unit.id);
    const revenue = unitBookings.reduce((sum, b) => {
      const price = b.price_override ?? b.total_price ?? 0;
      return sum + Number(price);
    }, 0);
    return { name: unit.name, revenue };
  });

  // Derived: state distribution
  const stateCounts: Record<string, number> = {};
  (bookings.data ?? []).forEach((b) => {
    stateCounts[b.state] = (stateCounts[b.state] ?? 0) + 1;
  });
  const stateDistribution = Object.entries(stateCounts).map(([state, count]) => ({
    state,
    count,
  }));

  // Derived: blocked vs bookable per unit (now includes maintenance)
  const blockedVsBookable = (units.data ?? []).map((unit) => {
    const unitBookings = (bookings.data ?? []).filter((b) => b.unit_id === unit.id);
    const unitMaintenance = (maintenanceBlocks.data ?? []).filter((m) => m.unit_id === unit.id);
    let bookedDays = 0;
    let blockedDays = 0;
    let maintenanceDays = 0;

    daysInRange.forEach((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const booked = unitBookings.some(
        (b) =>
          BLOCKING_STATES.includes(b.state as BookingState) &&
          b.check_in <= dayStr &&
          b.check_out > dayStr
      );
      if (booked) {
        bookedDays++;
        return;
      }
      const inMaintenance = unitMaintenance.some(
        (m) => m.start_date <= dayStr && m.end_date >= dayStr
      );
      if (inMaintenance) {
        maintenanceDays++;
        return;
      }
      const blocked = unitBookings.some(
        (b) =>
          ["cancelled", "no_show"].includes(b.state) === false &&
          !BLOCKING_STATES.includes(b.state as BookingState) &&
          b.check_in <= dayStr &&
          b.check_out > dayStr
      );
      if (blocked) blockedDays++;
    });

    const availableDays = daysInRange.length - bookedDays - blockedDays - maintenanceDays;
    return { name: unit.name, booked: bookedDays, blocked: blockedDays, maintenance: maintenanceDays, available: availableDays };
  });

  return {
    isLoading: bookings.isLoading || units.isLoading || maintenanceBlocks.isLoading,
    occupancyByDay,
    occupancyRate,
    revenueByUnit,
    stateDistribution,
    blockedVsBookable,
    rangeLabel: format(refDate, "MMMM yyyy"),
  };
}
