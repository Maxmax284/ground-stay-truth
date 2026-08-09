/**
 * Stay change history — the audit trail of every date/room modification on a
 * booking: what changed, who did it, what it cost, and whether the difference
 * was paid or waived.
 */
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import { formatCampShort } from "@/lib/timezone";
import { History, ArrowRight } from "lucide-react";
import { useStayModifications } from "@/hooks/useStayModifications";

const KIND_LABELS: Record<string, string> = {
  extend: "Extended",
  shorten: "Shortened",
  room_change: "Room change",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  relocation: "Dates moved",
  combined: "Dates + room",
  other: "Modified",
};

const PAYMENT_LABELS: Record<string, string> = {
  not_required: "No charge",
  waived: "Waived",
  pending: "Awaiting payment",
  paid: "Paid",
  failed: "Payment failed",
  credit_due: "Credit due",
  refunded: "Refunded",
};

export function StayModificationHistory({
  bookingId,
  policies,
}: {
  bookingId: string;
  policies?: any[];
}) {
  const { data: mods } = useStayModifications(bookingId);
  if (!mods || mods.length === 0) return null;

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <History className="h-3.5 w-3.5" /> Stay changes
      </p>
      {mods.map((m) => {
        const before = (m.before_snapshot?.segments ?? []) as any[];
        const after = (m.after_snapshot?.segments ?? []) as any[];
        return (
          <div key={m.id} className="space-y-1 border-l-2 border-border pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{KIND_LABELS[m.kind] ?? KIND_LABELS.other}</span>
              <Badge variant="outline" className="text-xs">
                {PAYMENT_LABELS[m.payment_status] ?? m.payment_status}
              </Badge>
              {m.status === "cancelled" && <Badge variant="destructive" className="text-xs">Cancelled</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {summarize(before)} <ArrowRight className="inline h-3 w-3" /> {summarize(after)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatPrice(m.pricing_before, policies)} → {formatPrice(m.pricing_after, policies)}
              {Number(m.waived_amount) > 0 && ` · ${formatPrice(m.waived_amount, policies)} waived`}
              {Number(m.final_amount) !== 0 && ` · ${formatPrice(Math.abs(Number(m.final_amount)), policies)} ${Number(m.final_amount) > 0 ? "charged" : "credit"}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {m.reason_code.replace(/_/g, " ")} · {m.actor_email ?? "staff"}
              {m.actor_role ? ` (${m.actor_role.replace(/_/g, " ")})` : ""} ·{" "}
              {formatCampShort(m.created_at)}
            </p>
            {m.notes && <p className="text-xs italic text-muted-foreground">"{m.notes}"</p>}
          </div>
        );
      })}
    </div>
  );
}

function summarize(segments: any[]): string {
  if (!segments || segments.length === 0) return "no rooms";
  const starts = segments.map((s) => s.starts_on).sort()[0];
  const ends = segments.map((s) => s.ends_on).sort().reverse()[0];
  const rooms = new Set(segments.map((s) => s.unit_id)).size;
  return `${starts} → ${ends}${rooms > 1 ? ` (${rooms} rooms)` : ""}`;
}
