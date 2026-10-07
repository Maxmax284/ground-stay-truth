/**
 * Cash Desk — record deposits and settle balances against each booking's total.
 * All writes go through QuickOfflinePaymentDialog → record_offline_payment,
 * which re-checks role, property and the overpayment cap server-side.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { canRecordOfflinePayment } from "@/lib/offlinePayments";
import { formatPrice } from "@/lib/currency";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { QuickOfflinePaymentDialog } from "@/components/bookings/QuickOfflinePaymentDialog";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";

export function CashDesk({ bookings, onOpen }: { bookings: FrontDeskBooking[]; onOpen: (id: string) => void }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const allowed = canRecordOfflinePayment(role ? [role] : []);
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<FrontDeskBooking | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bookings
      .filter((b) => showSettled || b.outstanding > 0)
      .filter((b) => {
        if (!needle) return true;
        const name = resolveGuestDisplayName(b as any)?.toLowerCase() ?? "";
        return name.includes(needle) || (b.units?.name ?? "").toLowerCase().includes(needle);
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [bookings, q, showSettled]);

  const owed = rows.reduce((s, b) => s + Math.max(0, b.outstanding), 0);

  return (
    <div className="space-y-3">
      <div className="camp-pass p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Cash desk</p>
          <p className="text-lg font-semibold">{formatPrice(owed)} still owed</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guest or room" className="h-9 min-w-0" />
          <Button size="sm" variant="outline" onClick={() => setShowSettled((v) => !v)}>
            {showSettled ? "Owing only" : "Show settled"}
          </Button>
        </div>
      </div>
      {!allowed && (
        <p className="text-xs text-muted-foreground">Only supervisors, managers and admins can record money. You can still see balances.</p>
      )}
      {rows.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nobody owes anything right now.</p>}
      {rows.map((b) => {
        const total = Number(b.total_price ?? 0);
        return (
          <div key={b.id} className="camp-pass carbon-chit p-3 pt-5 flex flex-wrap items-center gap-3 justify-between">
            <span className="carbon-serial" aria-hidden>LMT-CS-{b.id.slice(0, 6).toUpperCase()}</span>
            {b.outstanding <= 0 && <span className="carbon-paid" aria-hidden>Paid</span>}
            <button className="text-left min-w-0 flex-1" onClick={() => onOpen(b.id)}>
              <p className="font-medium truncate">{resolveGuestDisplayName(b as any) || "Guest"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {b.units?.name ?? "Room"} · {b.check_in} → {b.check_out} · {b.depositPaid ? "Deposit in" : "No deposit yet"}
              </p>
            </button>
            <div className="text-right text-xs tabular-nums">
              <div>Total {formatPrice(total)}</div>
              <div>Paid {formatPrice(b.totalPaid)}</div>
              <div className={b.outstanding > 0 ? "font-semibold camp-tone-locked" : "text-[hsl(var(--success))]"}>
                {b.outstanding > 0 ? `Owes ${formatPrice(b.outstanding)}` : "Settled"}
              </div>
            </div>
            {allowed && b.outstanding > 0 && (
              <Button size="sm" className="w-full sm:w-auto" onClick={() => setPaying(b)}>Record payment</Button>
            )}
          </div>
        );
      })}
      {paying && (
        <QuickOfflinePaymentDialog
          booking={paying}
          defaultNote="Taken at the front desk"
          onClose={() => { setPaying(null); qc.invalidateQueries({ queryKey: ["front-desk"] }); }}
        />
      )}
    </div>
  );
}
