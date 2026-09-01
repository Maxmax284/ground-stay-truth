/**
 * Modify Stay dialog.
 *
 * One surface for extending, shortening, moving rooms, or splitting a stay
 * across rooms. The flow is deliberately Plan → Check → Commit:
 *   1. staff edit the room legs
 *   2. "Check availability" asks the server (the only availability authority)
 *   3. "Apply change" commits, and — when the guest owes more — a payment
 *      request for the difference only is sent automatically.
 *
 * Money is never silently changed: the before / after / difference and any
 * waiver are shown before commit and written to the stay's change history.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, Loader2, Plus, ShieldCheck, Sparkles, Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUnits } from "@/hooks/useUnits";
import { usePricingRules } from "@/hooks/usePricingRules";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import {
  MODIFY_REASON_CODES, inferKind, quoteSegments, summarizeDelta, validateDraft,
  type DraftSegment,
} from "@/lib/modifyStay";
import {
  useBookingSegments, useModifyStay, type ModifyStayConflict,
} from "@/hooks/useStayModifications";
import { useBookingActiveAdjustments } from "@/hooks/useBookingActiveAdjustments";
import { computeCarryForward } from "@/lib/upgradeCarryForward";

export type ModifyStayMode = "change" | "upgrade";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    unit_id: string | null;
    check_in: string;
    check_out: string;
    num_guests: number;
    total_price: number;
    state: string;
  };
  completedStays?: number;
  /** "upgrade" opens the room-swap flow with automatic discount carry-forward. */
  initialMode?: ModifyStayMode;
}

let keySeq = 0;
const nextKey = () => `leg-${++keySeq}`;

export function ModifyStayDialog({
  open, onOpenChange, booking, completedStays = 0, initialMode = "change",
}: Props) {
  const { role } = useAuth();
  const canWaive = role === "admin" || role === "manager";
  const isAdmin = role === "admin";

  const { data: units } = useUnits();
  const { data: pricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();
  const { data: existingSegments } = useBookingSegments(open ? booking.id : null);
  const { data: activeAdjustments } = useBookingActiveAdjustments(open ? booking.id : null);
  const modify = useModifyStay();

  const [mode, setMode] = useState<ModifyStayMode>(initialMode);
  const [draft, setDraft] = useState<DraftSegment[]>([]);
  const [reasonCode, setReasonCode] = useState<string>("guest_request");
  const [notes, setNotes] = useState("");
  const [waiveInput, setWaiveInput] = useState("");
  /** Upgrade flow: let the system waive the re-applied discount automatically. */
  const [autoCarry, setAutoCarry] = useState(true);
  const [requestPayment, setRequestPayment] = useState(true);
  const [conflicts, setConflicts] = useState<ModifyStayConflict[] | null>(null);
  const [checked, setChecked] = useState(false);
  /** Pending check-in date edit awaiting staff confirmation on a live stay. */
  const [pendingStart, setPendingStart] = useState<{ key: string; value: string } | null>(null);



  // Baseline = the stay as it stands right now (segments, or the legacy
  // single-room shape for stays created before segments existed).
  const baseline = useMemo<DraftSegment[]>(() => {
    const active = (existingSegments ?? []).filter((s) => s.status === "active" || s.status === "pending");
    if (active.length > 0) {
      return active.map((s) => ({
        key: `existing-${s.id}`,
        id: s.id,
        unit_id: s.unit_id,
        starts_on: s.starts_on,
        ends_on: s.ends_on,
      }));
    }
    return booking.unit_id
      ? [{ key: "existing-legacy", unit_id: booking.unit_id, starts_on: booking.check_in, ends_on: booking.check_out }]
      : [];
  }, [existingSegments, booking.unit_id, booking.check_in, booking.check_out]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setDraft(baseline.map((s) => ({ ...s })));
    setConflicts(null);
    setChecked(false);
    setWaiveInput("");
    setAutoCarry(true);
    setNotes("");
    setReasonCode(initialMode === "upgrade" ? "guest_request" : "guest_request");
    setRequestPayment(true);
    setPendingStart(null);
  }, [open, baseline, initialMode]);


  const activeUnits = useMemo(
    () => (units ?? []).filter((u) => (u as any).is_active !== false),
    [units],
  );

  const beforeQuote = useMemo(
    () => quoteSegments(baseline, units ?? [], (pricingRules ?? []) as any, policies, booking.num_guests, completedStays),
    [baseline, units, pricingRules, policies, booking.num_guests, completedStays],
  );
  const afterQuote = useMemo(
    () => quoteSegments(draft, units ?? [], (pricingRules ?? []) as any, policies, booking.num_guests, completedStays),
    [draft, units, pricingRules, policies, booking.num_guests, completedStays],
  );

  // Money must be apples-to-apples: the difference is a fresh quote of the OLD
  // legs against a fresh quote of the NEW legs, both run through the same
  // calculator with the same guests and policies. Using the stored booking total
  // as the baseline mixed two pricing bases together and silently absorbed the
  // gap into the guest's bill (an added night could vanish behind a long-stay
  // tier shift). The stored total is still shown, as a reference, and any drift
  // between it and today's re-quote is surfaced instead of billed.
  const onRecordTotal = Number(booking.total_price ?? 0);
  const pricingBefore = beforeQuote.total || onRecordTotal;
  const recordDrift = Math.round((onRecordTotal - pricingBefore) * 100) / 100;
  const hasDrift = Math.abs(recordDrift) >= 0.01 && onRecordTotal > 0;
  const delta = useMemo(() => summarizeDelta(pricingBefore, afterQuote.total), [pricingBefore, afterQuote.total]);

  // Discount carry-forward. The server re-applies active human adjustments to
  // the new base price by itself; this is the same math shown to staff so they
  // can see the guest's real difference and never hand-waive it a second time.
  const carry = useMemo(
    () => computeCarryForward(activeAdjustments, pricingBefore, afterQuote.total),
    [activeAdjustments, pricingBefore, afterQuote.total],
  );
  const carryApplies = carry.lines.length > 0 && delta.calculated > 0 && carry.suggestedWaiver > 0.009;
  const autoWaiverActive = carryApplies && autoCarry && canWaive;

  const waived = autoWaiverActive
    ? Math.min(carry.suggestedWaiver, Math.max(0, delta.calculated))
    : Math.min(Math.max(0, Number(waiveInput) || 0), Math.max(0, delta.calculated));
  const finalAmount = Math.round((delta.calculated - waived) * 100) / 100;

  const structuralErrors = useMemo(() => validateDraft(draft), [draft]);
  const lineErrors = afterQuote.lines.filter((l) => l.error).map((l) => l.error as string);
  const unchanged = useMemo(
    () =>
      draft.length === baseline.length &&
      draft.every((d, i) =>
        d.unit_id === baseline[i]?.unit_id && d.starts_on === baseline[i]?.starts_on && d.ends_on === baseline[i]?.ends_on,
      ),
    [draft, baseline],
  );

  const blocking = [...structuralErrors, ...lineErrors];
  const kind = useMemo(() => inferKind(baseline, draft), [baseline, draft]);

  const updateLeg = (key: string, patch: Partial<DraftSegment>) => {
    setDraft((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    setChecked(false);
    setConflicts(null);
  };

  /**
   * Moving a stay's start date reprices the whole stay — staff usually mean to
   * add nights on the END. On a live stay we make them confirm.
   */
  const stayIsActive = booking.state === "checked_in" || booking.state === "confirmed";
  const requestStartChange = (key: string, value: string) => {
    const original = baseline.find((b) => b.key === key)?.starts_on;
    if (stayIsActive && original && value && value !== original) {
      setPendingStart({ key, value });
      return;
    }
    updateLeg(key, { starts_on: value });
  };

  /** Extend the stay: only ever touches the last leg's check-out date. */
  const extendStay = (nights = 1) => {
    const last = draft[draft.length - 1];
    if (!last) return;
    updateLeg(last.key, { ends_on: addDays(last.ends_on, nights) });
  };


  const addLeg = () => {
    const last = draft[draft.length - 1];
    setDraft((prev) => [
      ...prev,
      {
        key: nextKey(),
        unit_id: last?.unit_id ?? activeUnits[0]?.id ?? "",
        starts_on: last?.ends_on ?? booking.check_in,
        ends_on: addDays(last?.ends_on ?? booking.check_out, 1),
      },
    ]);
    setChecked(false);
    setConflicts(null);
  };

  const removeLeg = (key: string) => {
    setDraft((prev) => prev.filter((s) => s.key !== key));
    setChecked(false);
    setConflicts(null);
  };

  const runCheck = async () => {
    const res = await modify.mutateAsync({ action: "preview", bookingId: booking.id, segments: draft });
    if (res.error && !res.conflicts) {
      toast.error(res.message || res.error);
      return;
    }
    setConflicts(res.conflicts ?? []);
    setChecked(true);
    if ((res.conflicts ?? []).length === 0) toast.success("Those nights are free.");
  };

  const commit = async (force = false) => {
    const carryNote = autoWaiverActive
      ? `Existing discount re-applied to the new room price automatically (${formatPrice(waived, policies)} carried forward).`
      : "";
    const commitNotes = [notes.trim(), carryNote].filter(Boolean).join(" ");
    const commitKind =
      mode === "upgrade" ? (delta.calculated >= 0 ? "upgrade" : "downgrade") : kind;

    const res = await modify.mutateAsync({
      action: "commit",
      bookingId: booking.id,
      segments: draft,
      kind: commitKind as typeof kind,
      reasonCode,
      notes: commitNotes || undefined,
      pricingBefore,
      pricingAfter: afterQuote.total,
      onRecordTotal: onRecordTotal || undefined,
      waivedAmount: waived,
      requestPayment: requestPayment && finalAmount > 0,
      force,
      quote: { lines: afterQuote.lines.map((l) => ({ unit: l.unitName, nights: l.nights, amount: l.amount })), cleaningFee: afterQuote.cleaningFee },
    });

    if (res.error) {
      if (res.error === "conflict" && res.conflicts) {
        setConflicts(res.conflicts);
        setChecked(true);
        toast.error("Those nights are no longer free.");
        return;
      }
      toast.error(res.message || res.error);
      return;
    }

    const carriedNote = (res.carried_adjustments ?? []).length
      ? ` Existing discounts carried forward: ${(res.carried_adjustments ?? [])
          .map((a) => `${a.label} (${formatPrice(a.amount, policies)})`)
          .join(", ")}.`
      : "";

    if (res.payment_link_error) {
      toast.warning(`Stay updated, but the payment request failed: ${res.payment_link_error}`);
    } else if (res.payment_link?.url) {
      toast.success(`Stay updated. Payment request for ${formatPrice(res.final_amount ?? 0, policies)} sent.${carriedNote}`);
    } else {
      toast.success(`Stay updated.${carriedNote}`);
    }
    onOpenChange(false);
  };

  const hasConflicts = (conflicts ?? []).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "upgrade" ? <ArrowUpRight className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
            {mode === "upgrade" ? "Upgrade room" : "Modify stay"}
          </DialogTitle>
          <DialogDescription>
            {mode === "upgrade"
              ? "Same dates, different room. Any discount already on this booking is re-applied to the new price automatically — no manual maths."
              : "Change dates or rooms. Availability is checked against live inventory, and the guest is only asked to pay the difference."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-md bg-muted p-1">
          {([
            { id: "upgrade" as ModifyStayMode, label: "Upgrade room" },
            { id: "change" as ModifyStayMode, label: "Dates & legs" },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                setChecked(false);
                setConflicts(null);
                if (tab.id === "upgrade") setDraft(baseline.map((s) => ({ ...s })));
              }}
              className={`flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6">
          <div className="space-y-4 pb-2">
            {/* ── Current stay ── */}
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">Right now</p>
              {baseline.length === 0 && <p className="text-muted-foreground">No room assigned yet.</p>}
              {baseline.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{unitName(units, s.unit_id)}</span>
                  <span className="text-muted-foreground">{s.starts_on}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">{s.ends_on}</span>
                  {i === 0 && <Badge variant="outline" className="ml-auto text-xs">{formatPrice(pricingBefore, policies)}</Badge>}
                </div>
              ))}
              {carry.lines.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Discounts on this booking:{" "}
                  {carry.lines
                    .map((l) => `${l.label}${l.valueType === "percent" ? ` (${l.value}%)` : ""}`)
                    .join(", ")}{" "}
                  · guest pays {formatPrice(carry.netBefore, policies)} today
                </p>
              )}
            </div>

            {/* ── Draft legs ── */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm">{mode === "upgrade" ? "Move to" : "New plan"}</Label>
                {mode === "change" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 gap-1 text-xs"
                      onClick={() => extendStay(1)}
                      disabled={draft.length === 0}
                    >
                      <CalendarDays className="h-3.5 w-3.5" /> Extend stay +1 night
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addLeg}>
                      <Plus className="h-3.5 w-3.5" /> Add room leg
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "upgrade"
                  ? "Pick the new room. Dates stay exactly as they are — switch to “Dates & legs” if you also need to change nights."
                  : "To extend a stay, change the check-out date only — moving the check-in date shifts the whole stay and reprices it."}
              </p>


              {draft.map((leg, idx) => (
                <div key={leg.key} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {mode === "upgrade" && draft.length === 1 ? "Room" : `Leg ${idx + 1}`}
                    </span>
                    {mode === "change" && draft.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLeg(leg.key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className={`grid gap-2 ${mode === "upgrade" ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}>
                    <div className="space-y-1 sm:col-span-1">
                      <Label className="text-xs text-muted-foreground">Room</Label>
                      <Select value={leg.unit_id || undefined} onValueChange={(v) => updateLeg(leg.key, { unit_id: v })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Pick a room" /></SelectTrigger>
                        <SelectContent>
                          {activeUnits.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {mode === "upgrade" ? (
                      <p className="text-xs text-muted-foreground">
                        {leg.starts_on} → {leg.ends_on} (unchanged)
                      </p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <Label htmlFor={`start-${leg.key}`} className="text-xs text-muted-foreground">
                            Check-in date / Start date
                          </Label>
                          <Input
                            id={`start-${leg.key}`}
                            type="date"
                            className="h-9"
                            value={leg.starts_on}
                            onChange={(e) => requestStartChange(leg.key, e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">Moves the whole stay.</p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`end-${leg.key}`} className="text-xs text-muted-foreground">
                            Check-out date / End date
                          </Label>
                          <Input
                            id={`end-${leg.key}`}
                            type="date"
                            className="h-9"
                            value={leg.ends_on}
                            onChange={(e) => updateLeg(leg.key, { ends_on: e.target.value })}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            To extend a stay, change this date only.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  {(() => {
                    const line = afterQuote.lines.find((l) => l.key === leg.key);
                    if (!line) return null;
                    return line.error ? (
                      <p className="text-xs text-destructive">{line.error}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {line.nights} night{line.nights === 1 ? "" : "s"} · {formatPrice(line.amount, policies)}
                      </p>
                    );
                  })()}
                </div>
              ))}
            </div>

            {/* ── Availability ── */}
            {checked && !hasConflicts && (
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Rooms are free for these nights.
              </div>
            )}
            {hasConflicts && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Inventory conflict
                </p>
                {(conflicts ?? []).map((c, i) => (
                  <p key={i} className="text-xs text-destructive/90">{c.detail}</p>
                ))}
              </div>
            )}

            <Separator />

            {/* ── Reason + notes ── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-sm">Why is this changing?</Label>
                <Select value={reasonCode} onValueChange={setReasonCode}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODIFY_REASON_CODES.map((r) => (
                      <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Internal note (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Context for the next person reading this booking"
                  className="min-h-[38px] text-sm"
                  rows={2}
                />
              </div>
            </div>

            {/* ── Money ── */}
            <div className="rounded-md border border-border p-3 space-y-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Financial impact</p>
              <Row label={`Current stay (${beforeQuote.nights} night${beforeQuote.nights === 1 ? "" : "s"}, re-priced)`} value={formatPrice(pricingBefore, policies)} />
              {hasDrift && (
                <>
                  <Row label="Total on record" value={formatPrice(onRecordTotal, policies)} />
                  <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      The total on this booking is {formatPrice(Math.abs(recordDrift), policies)}{" "}
                      {recordDrift > 0 ? "higher" : "lower"} than today's price for the same nights
                      (old rates, a discount, or a manual edit). The guest is charged only for what
                      actually changes — this gap is not billed. Admins and managers are notified.
                    </span>
                  </p>
                </>
              )}
              <Row label={`New stay price (${afterQuote.nights} night${afterQuote.nights === 1 ? "" : "s"})`} value={formatPrice(afterQuote.total, policies)} />
              <Row
                label={delta.direction === "credit" ? "Credit due to guest" : "Difference"}
                value={`${delta.calculated > 0 ? "+" : ""}${formatPrice(Math.abs(delta.calculated), policies)}`}
                emphasis
              />
              {canWaive && delta.calculated > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Waive</Label>
                  <Input
                    type="number"
                    min={0}
                    max={delta.calculated}
                    value={waiveInput}
                    onChange={(e) => setWaiveInput(e.target.value)}
                    placeholder="0"
                    className="h-8 w-32"
                  />
                  <span className="text-xs text-muted-foreground">of {formatPrice(delta.calculated, policies)}</span>
                </div>
              )}
              {waived > 0 && <Row label="Waived" value={`− ${formatPrice(waived, policies)}`} />}
              <Separator />
              <Row
                label={finalAmount > 0 ? "Guest to pay" : finalAmount < 0 ? "To refund / credit" : "Nothing to collect"}
                value={formatPrice(Math.abs(finalAmount), policies)}
                emphasis
              />
              {finalAmount < 0 && (
                <p className="text-xs text-muted-foreground">
                  Credits are not refunded automatically — handle the refund from the Payments tab.
                </p>
              )}
              {finalAmount > 0 && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div>
                    <p className="text-sm">Send a payment request now</p>
                    <p className="text-xs text-muted-foreground">Emails the guest a secure link for the difference only.</p>
                  </div>
                  <Switch checked={requestPayment} onCheckedChange={setRequestPayment} />
                </div>
              )}
            </div>

            {blocking.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                {blocking.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={modify.isPending}>Cancel</Button>
          <Button variant="outline" onClick={runCheck} disabled={modify.isPending || blocking.length > 0 || unchanged}>
            {modify.isPending && !checked ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
            Check availability
          </Button>
          {hasConflicts && isAdmin ? (
            <Button variant="destructive" onClick={() => commit(true)} disabled={modify.isPending}>
              {modify.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Override & apply
            </Button>
          ) : (
            <Button onClick={() => commit(false)} disabled={modify.isPending || blocking.length > 0 || unchanged || !checked || hasConflicts}>
              {modify.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Apply change
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!pendingStart} onOpenChange={(o) => { if (!o) setPendingStart(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" /> Change the start date?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are changing the check-in/start date for an active stay. This moves the whole stay and
              may reprice the booking. If you only want to add nights, change the check-out date instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStart(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStart) updateLeg(pendingStart.key, { starts_on: pendingStart.value });
                setPendingStart(null);
              }}
            >
              Continue changing start date
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}


function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={emphasis ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{label}</span>
      <span className={emphasis ? "text-sm font-semibold tabular-nums" : "text-sm tabular-nums"}>{value}</span>
    </div>
  );
}

function unitName(units: { id: string; name: string }[] | undefined, id: string): string {
  return units?.find((u) => u.id === id)?.name ?? "Room";
}

function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return date;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}
