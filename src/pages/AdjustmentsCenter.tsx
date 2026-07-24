/**
 * Admin/manager global view of every discount/adjustment applied across
 * bookings. Filters, quick-apply flow, and one-click deep link into the
 * booking sheet. Read-only for anyone below manager.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Percent, Search, ExternalLink, Tag } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";

type Row = {
  id: string;
  booking_id: string;
  adjustment_type: string;
  status: string;
  label: string;
  value_type: string;
  value: number;
  amount_calculated: number;
  applied_at: string;
  applied_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  internal_note: string | null;
  bookings?: {
    id: string;
    check_in: string;
    check_out: string;
    state: string;
    total_price: number | null;
    units?: { name: string | null } | null;
    profiles?: { full_name: string | null; email: string | null } | null;
  } | null;
};

function useAdjustments() {
  return useQuery({
    queryKey: ["adjustments-center"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_adjustments")
        .select(`
          id, booking_id, adjustment_type, status, label, value_type, value,
          amount_calculated, applied_at, applied_by, voided_at, voided_by,
          void_reason, internal_note,
          bookings:bookings!booking_adjustments_booking_id_fkey (
            id, check_in, check_out, state, total_price,
            units:units ( name ),
            profiles:profiles!bookings_guest_id_fkey ( full_name, email )
          )
        `)
        .order("applied_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
}

function useActorEmails(ids: string[]) {
  return useQuery({
    queryKey: ["adjustment-actor-emails", ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", ids);
      if (error) throw error;
      const map: Record<string, { email: string | null; full_name: string | null }> = {};
      for (const p of data ?? []) map[(p as any).user_id] = { email: (p as any).email, full_name: (p as any).full_name };
      return map;
    },
  });
}

export default function AdjustmentsCenter() {
  const { role } = useAuth();
  const canManage = role === "admin" || role === "manager";
  const { data, isLoading } = useAdjustments();
  const { data: policies } = usePolicySettings();
  const [status, setStatus] = useState<"all" | "active" | "voided">("all");
  const [type, setType] = useState<"all" | "discount" | "surcharge">("all");
  const [q, setQ] = useState("");
  const [openBooking, setOpenBooking] = useState<string | null>(null);

  const rows = useMemo(() => {
    const src = data ?? [];
    return src.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (type !== "all" && r.adjustment_type !== type) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = [
          r.label,
          r.bookings?.units?.name,
          r.bookings?.profiles?.full_name,
          r.bookings?.profiles?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, status, type, q]);

  const actorIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.applied_by) set.add(r.applied_by);
      if (r.voided_by) set.add(r.voided_by);
    }
    return Array.from(set);
  }, [rows]);
  const { data: actors } = useActorEmails(actorIds);

  const totalDiscount = useMemo(
    () =>
      rows
        .filter((r) => r.status === "active" && r.adjustment_type === "discount")
        .reduce((s, r) => s + Number(r.amount_calculated ?? 0), 0),
    [rows],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Percent className="h-6 w-6" /> Adjustments Center
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Every discount and surcharge applied across all bookings. Voided
              entries are kept for audit — nothing is deleted.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Active discount value</div>
            <div className="text-lg font-semibold text-[hsl(var(--success))] tabular-nums">
              −{formatPrice(totalDiscount, policies)}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search guest, unit, label…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="voided">Voided only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="discount">Discounts</SelectItem>
                <SelectItem value="surcharge">Surcharges</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4" /> {rows.length} adjustment{rows.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No adjustments match these filters.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const isVoided = r.status === "voided";
                  const sign = r.adjustment_type === "discount" ? "−" : "+";
                  const guest =
                    r.bookings?.profiles?.full_name ||
                    r.bookings?.profiles?.email ||
                    "Guest";
                  const unit = r.bookings?.units?.name ?? "—";
                  const appliedBy =
                    (r.applied_by && actors?.[r.applied_by]?.full_name) ||
                    (r.applied_by && actors?.[r.applied_by]?.email) ||
                    "system";
                  return (
                    <div
                      key={r.id}
                      className={`rounded-md border p-3 flex items-start gap-3 ${isVoided ? "bg-muted/40 opacity-70" : "bg-card"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{r.label}</span>
                          {isVoided ? (
                            <Badge variant="outline" className="text-[10px]">Voided</Badge>
                          ) : (
                            <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-0">
                              Active
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {r.adjustment_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {r.value_type === "percent" ? `${r.value}%` : formatPrice(Number(r.value), policies)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                          <span className="font-medium text-foreground">{guest}</span>
                          <span>· {unit}</span>
                          {r.bookings?.check_in && (
                            <span>
                              · {format(new Date(r.bookings.check_in), "MMM d")} →{" "}
                              {format(new Date(r.bookings.check_out!), "MMM d, yyyy")}
                            </span>
                          )}
                          <span>· Applied by {appliedBy}</span>
                          <span>· {format(new Date(r.applied_at), "MMM d, yyyy p")}</span>
                        </div>
                        {r.internal_note && (
                          <p className="text-xs text-muted-foreground italic mt-1 truncate">
                            Note: "{r.internal_note}"
                          </p>
                        )}
                        {isVoided && r.void_reason && (
                          <p className="text-xs text-destructive mt-1 truncate">
                            Voided: "{r.void_reason}"
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <div className={`text-sm font-semibold tabular-nums ${r.adjustment_type === "discount" && !isVoided ? "text-[hsl(var(--success))]" : ""}`}>
                          {sign}{formatPrice(Number(r.amount_calculated), policies)}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setOpenBooking(r.booking_id)}
                        >
                          Open <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BookingDetailSheet
        bookingId={openBooking}
        open={!!openBooking}
        onOpenChange={(o) => !o && setOpenBooking(null)}
        isAdmin={canManage}
      />
    </DashboardLayout>
  );
}
