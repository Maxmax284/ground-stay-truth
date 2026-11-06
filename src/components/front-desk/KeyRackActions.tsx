/**
 * Key-rack actions: tap a free cubby → walk-in booking sheet;
 * tap a maintenance cubby → block details (+ release for managers/admins).
 * Bookings go through the audited admin-booking-flow function, which also
 * refuses maintenance-blocked rooms server-side.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Wrench, DoorOpen, Loader2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUnits } from "@/hooks/useUnits";
import { usePricingRules } from "@/hooks/usePricingRules";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useDeleteMaintenanceBlock, type MaintenanceBlock } from "@/hooks/useMaintenanceBlocks";
import { supabase } from "@/integrations/supabase/client";
import { calculatePricing, getRulesForUnit } from "@/lib/pricingCalculator";
import { formatPrice } from "@/lib/currency";

export function campToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** Block end_date is inclusive (last blocked night). */
export function blockOverlaps(b: Pick<MaintenanceBlock, "start_date" | "end_date">, checkIn: string, checkOut: string) {
  return b.start_date < checkOut && b.end_date >= checkIn;
}

const fmt = (d: string) => format(parseISO(d), "EEE d MMM");

export function MaintenanceSheet({
  block, unitName, onClose,
}: { block: MaintenanceBlock | null; unitName: string; onClose: () => void }) {
  const { role } = useAuth();
  const canRelease = role === "admin" || role === "manager";
  const release = useDeleteMaintenanceBlock();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <Sheet open={!!block} onOpenChange={(o) => { if (!o) { setConfirming(false); onClose(); } }}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto sm:max-w-lg sm:mx-auto">
        {block && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-warning" /> {unitName} — blocked</SheetTitle>
              <SheetDescription>Not sellable. Nobody can be booked into this room while the block is on.</SheetDescription>
            </SheetHeader>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Reason</dt><dd className="font-medium">{block.reason || "No reason given"}</dd>
              <dt className="text-muted-foreground">From</dt><dd>{fmt(block.start_date)}</dd>
              <dt className="text-muted-foreground">Through</dt><dd>{fmt(block.end_date)} (last blocked night)</dd>
            </dl>
            <div className="mt-6 flex flex-col gap-2">
              {canRelease ? (
                confirming ? (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-11" onClick={() => setConfirming(false)}>Keep blocked</Button>
                    <Button
                      variant="destructive" className="flex-1 h-11" disabled={release.isPending}
                      onClick={() => release.mutate(block.id, {
                        onSuccess: () => { toast({ title: `${unitName} released`, description: "Room is sellable again." }); onClose(); },
                        onError: (e: any) => toast({ title: "Couldn't release", description: e.message, variant: "destructive" }),
                      })}
                    >
                      {release.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Yes, release room
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" className="h-11" onClick={() => setConfirming(true)}>Release room (clear block)</Button>
                )
              ) : (
                <p className="text-xs text-muted-foreground">Only a manager or admin can release this block.</p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function WalkInSheet({
  unitId, blocks, onClose, onCreated,
}: {
  unitId: string | null;
  blocks: MaintenanceBlock[];
  onClose: () => void;
  onCreated: (bookingId: string) => void;
}) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: units } = useUnits();
  const { data: pricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();
  const unit = (units ?? []).find((u) => u.id === unitId);

  const today = campToday();
  const [form, setForm] = useState({ name: "", email: "", phone: "", checkOut: format(addDays(parseISO(today), 7), "yyyy-MM-dd"), guests: "1", price: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const nights = differenceInCalendarDays(parseISO(form.checkOut), parseISO(today));

  const blockHit = blocks.find((b) => b.unit_id === unitId && nights > 0 && blockOverlaps(b, today, form.checkOut));

  const conflicts = useQuery({
    queryKey: ["walkin-conflicts", unitId, today, form.checkOut],
    enabled: !!unitId && nights > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select("id, check_in, check_out")
        .eq("unit_id", unitId!)
        .not("state", "in", '("cancelled","no_show","completed")')
        .lt("check_in", form.checkOut).gt("check_out", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  const suggested = useMemo(() => {
    if (!unit || nights <= 0) return 0;
    try {
      return calculatePricing(unit as any, today, form.checkOut, getRulesForUnit(pricingRules ?? [], unit as any), undefined, policies, undefined, 0, Number(form.guests) || 1).total;
    } catch { return 0; }
  }, [unit, today, form.checkOut, form.guests, pricingRules, policies, nights]);
  const price = Number(form.price || suggested || 0);

  const clash = (conflicts.data?.length ?? 0) > 0;
  const emailOk = /\S+@\S+\.\S+/.test(form.email.trim());
  const canSubmit = isAdmin && !busy && !blockHit && !clash && nights > 0 && form.name.trim().length > 1 && emailOk;

  const reset = () => setForm((f) => ({ ...f, name: "", email: "", phone: "", price: "", notes: "" }));

  const submit = async () => {
    if (!unitId || !canSubmit) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-booking-flow", {
        body: {
          action: "create_booking_flow",
          guest: { full_name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), preferred_language: "en", notes: "" },
          stay: {
            unit_id: unitId, check_in: today, check_out: form.checkOut,
            num_guests: Number(form.guests) || 1, state: "confirmed", guest_type: "standard",
            total_price: price > 0 ? price : null, notes: ["Walk-in (Front Desk key rack)", form.notes.trim()].filter(Boolean).join("\n"),
            pay_on_arrival: true,
          },
          pickup: { enabled: false },
          confirm_landing_now: false,
        },
      });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* keep */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["front-desk"] }),
        qc.invalidateQueries({ queryKey: ["bookings"] }),
      ]);
      toast({ title: `${unit?.name} booked`, description: `${form.name.trim()} · ${nights} night${nights === 1 ? "" : "s"}. Check them in from the booking.` });
      reset();
      onClose();
      const id = (data as any)?.booking_id;
      if (id) onCreated(id);
    } catch (e: any) {
      toast({ title: "Booking not created", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Sheet open={!!unitId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg sm:mx-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-primary" /> Walk-in · {unit?.name ?? "Room"}</SheetTitle>
          <SheetDescription>Checks in today ({fmt(today)}). Creates a confirmed, pay-on-arrival booking.</SheetDescription>
        </SheetHeader>

        {!isAdmin && (
          <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
            Only an admin can create bookings from the rack. Ask an admin, or send the guest's details through Messages.
          </p>
        )}

        <div className="mt-4 grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="wi-name">Guest name</Label><Input id="wi-name" value={form.name} onChange={set("name")} autoComplete="off" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="wi-email">Email</Label><Input id="wi-email" type="email" inputMode="email" value={form.email} onChange={set("email")} /></div>
            <div className="grid gap-1.5"><Label htmlFor="wi-phone">Phone</Label><Input id="wi-phone" type="tel" value={form.phone} onChange={set("phone")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="wi-out">Check-out</Label><Input id="wi-out" type="date" min={format(addDays(parseISO(today), 1), "yyyy-MM-dd")} value={form.checkOut} onChange={set("checkOut")} /></div>
            <div className="grid gap-1.5"><Label htmlFor="wi-guests">Guests</Label><Input id="wi-guests" type="number" min={1} value={form.guests} onChange={set("guests")} /></div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wi-price">Total price {suggested > 0 && <span className="text-muted-foreground font-normal">(suggested {formatPrice(suggested)})</span>}</Label>
            <Input id="wi-price" type="number" inputMode="decimal" placeholder={suggested ? String(Math.round(suggested)) : ""} value={form.price} onChange={set("price")} />
          </div>
          <div className="grid gap-1.5"><Label htmlFor="wi-notes">Notes</Label><Textarea id="wi-notes" rows={2} value={form.notes} onChange={set("notes")} /></div>

          {blockHit && (
            <p className="flex gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
              <Wrench className="h-4 w-4 shrink-0 mt-0.5" /> Blocked for maintenance {fmt(blockHit.start_date)} – {fmt(blockHit.end_date)}{blockHit.reason ? ` (${blockHit.reason})` : ""}. Shorten the stay or pick another room.
            </p>
          )}
          {clash && (
            <p className="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> Another booking lands in this room before {fmt(form.checkOut)}. Shorten the stay or pick another room.
            </p>
          )}

          <Button className="h-12 mt-1" disabled={!canSubmit} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Book {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : ""}{price > 0 ? ` · ${formatPrice(price)}` : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
