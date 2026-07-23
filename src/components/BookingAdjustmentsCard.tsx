/**
 * Shows active + voided adjustments for a booking. Admin/manager sees a
 * Void button on active rows. Guests only see active ones (per RLS).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/currency";
import { formatInPropertyTimezone } from "@/lib/timezone";
import { Tag, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  bookingId: string;
  canManage: boolean;
  policies?: any[];
}

export function BookingAdjustmentsCard({ bookingId, canManage, policies }: Props) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const { data: adjustments } = useQuery({
    queryKey: ["booking-adjustments", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_adjustments")
        .select("*")
        .eq("booking_id", bookingId)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!adjustments || adjustments.length === 0) return null;

  const handleVoid = async (id: string) => {
    if (!session) return;
    const reason = window.prompt("Reason for voiding this discount?");
    if (!reason?.trim()) return;
    setVoidingId(id);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apply-booking-adjustment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "void", adjustmentId: id, reason: reason.trim() }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) { toast.error(json?.error || "Failed to void"); return; }
      toast.success("Discount voided. Send a fresh payment link.");
      qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-adjustments", bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-financials-payments", bookingId] });
      qc.invalidateQueries({ queryKey: ["payment-links", bookingId] });
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Tag className="h-3.5 w-3.5" /> Adjustments
      </div>
      {adjustments.map((a: any) => {
        const isVoided = a.status === "voided";
        const sign = a.adjustment_type === "discount" ? "−" : "+";
        return (
          <div key={a.id} className={`flex items-start justify-between gap-3 text-sm ${isVoided ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{a.label}</span>
                {isVoided
                  ? <Badge variant="outline" className="text-[10px]">Voided</Badge>
                  : <Badge className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-0">Active</Badge>}
                <span className="text-xs text-muted-foreground">
                  {a.value_type === "percent" ? `${a.value}%` : formatPrice(Number(a.value), policies)}
                </span>
              </div>
              {a.internal_note && canManage && (
                <p className="text-xs text-muted-foreground italic mt-0.5 truncate">"{a.internal_note}"</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatInPropertyTimezone(a.applied_at)}
                {isVoided && a.voided_at ? ` · voided ${formatInPropertyTimezone(a.voided_at)}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-sm font-medium tabular-nums ${a.adjustment_type === "discount" && !isVoided ? "text-[hsl(var(--success))]" : ""}`}>
                {sign}{formatPrice(Number(a.amount_calculated), policies)}
              </div>
              {canManage && !isVoided && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleVoid(a.id)} disabled={voidingId === a.id}>
                  <X className="h-3 w-3 mr-1" /> Void
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
