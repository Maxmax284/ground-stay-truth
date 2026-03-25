import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from "date-fns";
import { isPaymentReceived } from "@/lib/paymentTypes";

export function usePaymentAnalytics(monthOffset = 0) {
  const refDate = subMonths(new Date(), monthOffset);
  const rangeStart = startOfMonth(refDate);
  const rangeEnd = endOfMonth(refDate);
  const rangeStartStr = format(rangeStart, "yyyy-MM-dd'T'00:00:00");
  const rangeEndStr = format(rangeEnd, "yyyy-MM-dd'T'23:59:59");

  const paymentsQuery = useQuery({
    queryKey: ["payment-analytics", rangeStartStr, rangeEndStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, booking_id, amount, status, method, payment_type, provider, refund_amount, created_at")
        .gte("created_at", rangeStartStr)
        .lte("created_at", rangeEndStr);
      if (error) throw error;
      return data;
    },
  });

  // For outstanding balances by unit we need bookings + units
  const bookingsQuery = useQuery({
    queryKey: ["payment-analytics-bookings", rangeStartStr, rangeEndStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, unit_id, total_price, state, units(name)")
        .not("state", "in", "(cancelled,no_show)")
        .lte("check_in", format(rangeEnd, "yyyy-MM-dd"))
        .gte("check_out", format(rangeStart, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
  });

  const allPaymentsForBookings = useQuery({
    queryKey: ["payment-analytics-booking-payments", rangeStartStr, rangeEndStr],
    queryFn: async () => {
      const ids = bookingsQuery.data?.map((b) => b.id) ?? [];
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("booking_id, amount, status, refund_amount")
        .in("booking_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: !!bookingsQuery.data,
  });

  const payments = paymentsQuery.data ?? [];

  // Revenue trend by day
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const revenueTrend = days.map((day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    const dayPayments = payments.filter((p) => p.created_at.startsWith(dayStr) && isPaymentReceived(p.status));
    const revenue = dayPayments.reduce((s, p) => s + Number(p.amount), 0);
    const refunds = dayPayments.reduce((s, p) => s + Number(p.refund_amount ?? 0), 0);
    return { date: format(day, "MMM d"), revenue, refunds, net: revenue - refunds };
  });

  // KPIs
  const totalGross = payments.filter((p) => isPaymentReceived(p.status)).reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunds = payments.filter((p) => p.status === "refunded" || p.status === "partially_refunded").reduce((s, p) => s + Number(p.refund_amount ?? 0), 0);
  const totalNet = totalGross - totalRefunds;
  const refundCount = payments.filter((p) => p.status === "refunded" || p.status === "partially_refunded").length;
  const totalCount = payments.length;
  const refundRate = totalCount > 0 ? Math.round((refundCount / totalCount) * 100) : 0;

  // Method distribution
  const methodCounts: Record<string, number> = {};
  payments.filter((p) => isPaymentReceived(p.status)).forEach((p) => {
    const key = p.method || "unknown";
    methodCounts[key] = (methodCounts[key] ?? 0) + 1;
  });
  const methodDistribution = Object.entries(methodCounts).map(([method, count]) => ({ method, count }));

  // Payment type distribution
  const typeCounts: Record<string, number> = {};
  payments.filter((p) => isPaymentReceived(p.status)).forEach((p) => {
    const key = p.payment_type || "deposit";
    typeCounts[key] = (typeCounts[key] ?? 0) + 1;
  });
  const typeDistribution = Object.entries(typeCounts).map(([type, count]) => ({ type, count }));

  // Outstanding balances by unit
  const outstandingByUnit: Array<{ name: string; outstanding: number }> = [];
  if (bookingsQuery.data && allPaymentsForBookings.data) {
    const payMap = new Map<string, { paid: number; refunded: number }>();
    allPaymentsForBookings.data.forEach((p) => {
      const e = payMap.get(p.booking_id) ?? { paid: 0, refunded: 0 };
      if (isPaymentReceived(p.status)) e.paid += Number(p.amount);
      if (p.status === "refunded" || p.status === "partially_refunded") e.refunded += Number(p.refund_amount ?? 0);
      payMap.set(p.booking_id, e);
    });

    const unitMap = new Map<string, { name: string; outstanding: number }>();
    bookingsQuery.data.forEach((b) => {
      const unitName = (b.units as any)?.name ?? "Unknown";
      const total = Number(b.total_price ?? 0);
      const p = payMap.get(b.id) ?? { paid: 0, refunded: 0 };
      const outstanding = Math.max(0, total - p.paid + p.refunded);
      const entry = unitMap.get(b.unit_id) ?? { name: unitName, outstanding: 0 };
      entry.outstanding += outstanding;
      unitMap.set(b.unit_id, entry);
    });
    unitMap.forEach((v) => outstandingByUnit.push(v));
  }

  return {
    isLoading: paymentsQuery.isLoading || bookingsQuery.isLoading || allPaymentsForBookings.isLoading,
    rangeLabel: format(refDate, "MMMM yyyy"),
    revenueTrend,
    totalGross,
    totalRefunds,
    totalNet,
    refundRate,
    refundCount,
    totalCount,
    methodDistribution,
    typeDistribution,
    outstandingByUnit,
    rawPayments: payments,
  };
}
    totalRefunds,
    totalNet,
    refundRate,
    refundCount,
    totalCount,
    methodDistribution,
    typeDistribution,
    outstandingByUnit,
  };
}
