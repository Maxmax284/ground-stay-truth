import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PlaneLanding,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDrivers } from "@/hooks/useDrivers";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { usePricingRules } from "@/hooks/usePricingRules";
import { useUnits } from "@/hooks/useUnits";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { fromCampInputValue } from "@/lib/timezone";
import { calculatePricing, getRulesForUnit } from "@/lib/pricingCalculator";

const NONE = "__none__";
const AIRPORTS = [
  { value: "USM", label: "Koh Samui (USM)" },
  { value: "BKK", label: "Bangkok Suvarnabhumi (BKK)" },
  { value: "DMK", label: "Don Mueang (DMK)" },
  { value: "URT", label: "Surat Thani (URT)" },
  { value: "HKT", label: "Phuket (HKT)" },
  { value: "CNX", label: "Chiang Mai (CNX)" },
  { value: "KBV", label: "Krabi (KBV)" },
  { value: "SIN", label: "Singapore (SIN)" },
  { value: "KUL", label: "Kuala Lumpur (KUL)" },
];

const STEPS = ["guest", "stay", "pickup", "review"] as const;
type Step = (typeof STEPS)[number];

interface FlowResult {
  booking_id: string;
  guest_user_id: string;
  guest_account_created: boolean;
  pickup_id: string | null;
  landing?: { landed_at: string; driver: unknown } | null;
}

function defaultDate(offset: number) {
  return format(addDays(new Date(), offset), "yyyy-MM-dd");
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${active ? "border-primary bg-primary/10 text-primary" : done ? "border-success/50 bg-success/10 text-foreground" : "border-border bg-card text-muted-foreground"}`}>
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-current" />}
      <span className="font-medium">{label}</span>
    </div>
  );
}

export default function AdminBookingFlow() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: units } = useUnits();
  const { data: drivers } = useDrivers(true);
  const { data: pricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();

  const [step, setStep] = useState<Step>("guest");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<FlowResult | null>(null);

  const [guest, setGuest] = useState({
    full_name: "",
    email: "",
    phone: "",
    preferred_language: "en",
    notes: "",
  });
  const [stay, setStay] = useState({
    unit_id: "",
    check_in: defaultDate(1),
    check_out: defaultDate(8),
    num_guests: "1",
    state: "confirmed",
    guest_type: "standard",
    total_price: "",
    notes: "",
    pay_on_arrival: true,
  });
  const [pickup, setPickup] = useState({
    enabled: true,
    driver_id: "",
    confirmed_airport: "USM",
    flight_number: "",
    international_flight_number: "",
    arrival_datetime: "",
    passenger_count: "1",
    fee: "600",
    luggage_notes: "",
    special_instructions: "",
  });
  const [confirmLandingNow, setConfirmLandingNow] = useState(false);

  const activeUnits = (units ?? []).filter((u) => u.is_active);
  const selectedUnit = activeUnits.find((u) => u.id === stay.unit_id);
  const stepIndex = STEPS.indexOf(step);
  const nights = stay.check_in && stay.check_out ? differenceInCalendarDays(new Date(stay.check_out), new Date(stay.check_in)) : 0;

  const conflicts = useQuery({
    queryKey: ["admin-booking-flow-conflicts", stay.unit_id, stay.check_in, stay.check_out],
    enabled: !!stay.unit_id && !!stay.check_in && !!stay.check_out && nights > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, check_in, check_out, state, manual_guest_name, profiles!bookings_guest_id_profiles_fkey(full_name)")
        .eq("unit_id", stay.unit_id)
        .not("state", "in", '("cancelled","no_show")')
        .lt("check_in", stay.check_out)
        .gt("check_out", stay.check_in);
      if (error) throw error;
      return data ?? [];
    },
  });

  const suggestedPrice = useMemo(() => {
    if (!selectedUnit || !stay.check_in || !stay.check_out || nights <= 0) return 0;
    const unitRules = getRulesForUnit(pricingRules ?? [], selectedUnit as any);
    return calculatePricing(selectedUnit as any, stay.check_in, stay.check_out, unitRules, undefined, policies, undefined, 0, Number(stay.num_guests) || 1).total;
  }, [selectedUnit, stay.check_in, stay.check_out, stay.num_guests, pricingRules, policies, nights]);

  const finalPrice = Number(stay.total_price || suggestedPrice || 0);
  const selectedDriver = drivers?.find((d) => d.id === pickup.driver_id);

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!guest.full_name.trim()) issues.push("Guest name is required.");
    if (!guest.email.trim() || !guest.email.includes("@")) issues.push("A valid guest email is required.");
    if (!stay.unit_id) issues.push("Choose a unit.");
    if (!stay.check_in || !stay.check_out || nights <= 0) issues.push("Check-out must be after check-in.");
    if (conflicts.data?.length) issues.push("Selected unit has a booking conflict in those dates.");
    if (pickup.enabled && confirmLandingNow && !pickup.driver_id) issues.push("Assign a driver before confirming landing now.");
    return issues;
  }, [guest, stay.unit_id, stay.check_in, stay.check_out, nights, conflicts.data, pickup.enabled, pickup.driver_id, confirmLandingNow]);

  const canMoveNext = () => {
    if (step === "guest") return !!guest.full_name.trim() && !!guest.email.trim() && guest.email.includes("@");
    if (step === "stay") return !!stay.unit_id && nights > 0 && !conflicts.data?.length;
    if (step === "pickup") return !pickup.enabled || !confirmLandingNow || !!pickup.driver_id;
    return validation.length === 0;
  };

  const nextStep = () => {
    const next = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    setStep(next);
  };

  const prevStep = () => {
    const prev = STEPS[Math.max(stepIndex - 1, 0)];
    setStep(prev);
  };

  const createFlow = async () => {
    if (validation.length > 0) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-booking-flow", {
        body: {
          action: "create_booking_flow",
          guest,
          stay: {
            ...stay,
            num_guests: Number(stay.num_guests) || 1,
            total_price: finalPrice > 0 ? finalPrice : null,
            pay_on_arrival: stay.pay_on_arrival,
          },
          pickup: {
            ...pickup,
            enabled: pickup.enabled,
            driver_id: pickup.driver_id || null,
            arrival_datetime: fromCampInputValue(pickup.arrival_datetime),
            passenger_count: Number(pickup.passenger_count) || Number(stay.num_guests) || 1,
            fee: Number(pickup.fee) || 0,
          },
          confirm_landing_now: confirmLandingNow,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as FlowResult);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bookings"] }),
        qc.invalidateQueries({ queryKey: ["arrivals-board"] }),
        qc.invalidateQueries({ queryKey: ["airport_pickup"] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast({ title: "Booking flow created", description: "Guest, booking, pickup and board data are live." });
      setStep("review");
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message ?? "Booking flow failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5" data-ai-focus="admin-booking-flow">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" />
              {t("adminBookingFlow.title", "Admin Booking Flow")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("adminBookingFlow.subtitle", "Create the guest account, booking, pickup, driver assignment and arrival state in one audited pass.")}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/front-desk?view=arrivals")}>{t("adminBookingFlow.openArrivals", "Open Arrivals Board")}</Button>
        </div>

        <Alert className="border-primary/30 bg-primary/5">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>{t("adminBookingFlow.noBackdoorTitle", "No standing test account")}</AlertTitle>
          <AlertDescription>{t("adminBookingFlow.noBackdoorDesc", "This creates or links the named guest only. No shared QA login, no hidden bypass, and every action is logged.")}</AlertDescription>
        </Alert>

        <div className="grid gap-2 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <StepPill key={s} active={step === s} done={i < stepIndex || !!result} label={t(`adminBookingFlow.steps.${s}`, s)} />
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {step === "guest" && t("adminBookingFlow.guestTitle", "Guest account")}
                {step === "stay" && t("adminBookingFlow.stayTitle", "Stay details")}
                {step === "pickup" && t("adminBookingFlow.pickupTitle", "Pickup and driver")}
                {step === "review" && t("adminBookingFlow.reviewTitle", "Review and create")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === "guest" && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="guest-name">Guest name *</Label>
                      <Input id="guest-name" value={guest.full_name} onChange={(e) => setGuest({ ...guest, full_name: e.target.value })} placeholder="Sarah Ehirim" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guest-email">Email *</Label>
                      <Input id="guest-email" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} placeholder="guest@example.com" />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="guest-phone">Phone</Label>
                      <Input id="guest-phone" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} placeholder="+66..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Language</Label>
                      <Select value={guest.preferred_language} onValueChange={(v) => setGuest({ ...guest, preferred_language: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="th">Thai</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-notes">Guest note</Label>
                    <Textarea id="guest-notes" value={guest.notes} onChange={(e) => setGuest({ ...guest, notes: e.target.value })} placeholder="Arrival context, WhatsApp note, mobility note..." />
                  </div>
                </div>
              )}

              {step === "stay" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Unit *</Label>
                    <Select value={stay.unit_id || NONE} onValueChange={(v) => setStay({ ...stay, unit_id: v === NONE ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE} disabled>Select unit</SelectItem>
                        {activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · max {u.capacity}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="check-in">Check-in *</Label>
                      <Input id="check-in" type="date" value={stay.check_in} onChange={(e) => setStay({ ...stay, check_in: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="check-out">Check-out *</Label>
                      <Input id="check-out" type="date" value={stay.check_out} onChange={(e) => setStay({ ...stay, check_out: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="num-guests">Guests</Label>
                      <Input id="num-guests" type="number" min={1} value={stay.num_guests} onChange={(e) => setStay({ ...stay, num_guests: e.target.value, total_price: "" })} />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Select value={stay.state} onValueChange={(v) => setStay({ ...stay, state: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="pending_deposit">Pending deposit</SelectItem>
                          <SelectItem value="inquiry">Inquiry</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="total-price">Total price</Label>
                      <Input id="total-price" type="number" min={0} value={stay.total_price} onChange={(e) => setStay({ ...stay, total_price: e.target.value })} placeholder={suggestedPrice ? String(Math.round(suggestedPrice)) : "0"} />
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-md border border-border p-3">
                    <Checkbox id="pay-arrival" checked={stay.pay_on_arrival} onCheckedChange={(checked) => setStay({ ...stay, pay_on_arrival: checked === true })} />
                    <Label htmlFor="pay-arrival" className="text-sm leading-5">Pay on arrival / staff-settled booking</Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stay-notes">Internal booking notes</Label>
                    <Textarea id="stay-notes" value={stay.notes} onChange={(e) => setStay({ ...stay, notes: e.target.value })} placeholder="Why staff created this, payment context, source..." />
                  </div>
                  {suggestedPrice > 0 && (
                    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                      Suggested total: <span className="font-semibold">{formatPrice(suggestedPrice, policies)}</span> for {nights} nights. Override only if Nikki/staff made a clear decision.
                    </div>
                  )}
                  {!!conflicts.data?.length && (
                    <Alert variant="destructive">
                      <AlertTitle>Unit conflict</AlertTitle>
                      <AlertDescription>This room already has an active booking in that date range.</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {step === "pickup" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 rounded-md border border-border p-3">
                    <Checkbox id="pickup-enabled" checked={pickup.enabled} onCheckedChange={(checked) => setPickup({ ...pickup, enabled: checked === true })} />
                    <Label htmlFor="pickup-enabled" className="text-sm leading-5">Create airport pickup for this booking</Label>
                  </div>
                  {pickup.enabled && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Driver</Label>
                          <Select value={pickup.driver_id || NONE} onValueChange={(v) => setPickup({ ...pickup, driver_id: v === NONE ? "" : v })}>
                            <SelectTrigger><SelectValue placeholder="Assign driver" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>No driver yet</SelectItem>
                              {(drivers ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.license_plate ? ` · ${d.license_plate}` : ""}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Final airport</Label>
                          <Select value={pickup.confirmed_airport} onValueChange={(v) => setPickup({ ...pickup, confirmed_airport: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{AIRPORTS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="final-flight">Final flight</Label>
                          <Input id="final-flight" value={pickup.flight_number} onChange={(e) => setPickup({ ...pickup, flight_number: e.target.value.toUpperCase() })} placeholder="PG5125" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="intl-flight">International flight</Label>
                          <Input id="intl-flight" value={pickup.international_flight_number} onChange={(e) => setPickup({ ...pickup, international_flight_number: e.target.value.toUpperCase() })} placeholder="QR838" />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="arrival-time">Arrival time</Label>
                          <Input id="arrival-time" type="datetime-local" value={pickup.arrival_datetime} onChange={(e) => setPickup({ ...pickup, arrival_datetime: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="pickup-fee">Pickup fee</Label>
                          <Input id="pickup-fee" type="number" min={0} value={pickup.fee} onChange={(e) => setPickup({ ...pickup, fee: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="pax">Passengers</Label>
                          <Input id="pax" type="number" min={1} value={pickup.passenger_count} onChange={(e) => setPickup({ ...pickup, passenger_count: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="luggage">Luggage</Label>
                          <Input id="luggage" value={pickup.luggage_notes} onChange={(e) => setPickup({ ...pickup, luggage_notes: e.target.value })} placeholder="2 bags, gym gear..." />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pickup-notes">Meeting notes</Label>
                        <Textarea id="pickup-notes" value={pickup.special_instructions} onChange={(e) => setPickup({ ...pickup, special_instructions: e.target.value })} placeholder="Meet at main exit, driver will hold LMT sign..." />
                      </div>
                      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                        <Checkbox id="confirm-landing" checked={confirmLandingNow} onCheckedChange={(checked) => setConfirmLandingNow(checked === true)} />
                        <Label htmlFor="confirm-landing" className="text-sm leading-5">Confirm landing immediately and alert staff/guest with driver details</Label>
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === "review" && (
                <div className="space-y-4">
                  {result ? (
                    <Alert className="border-success/40 bg-success/10">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertTitle>Booking flow complete</AlertTitle>
                      <AlertDescription>
                        Booking is live, pickup is linked, and the Arrivals Board can see it now.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Card>
                      <CardContent className="p-3 text-sm space-y-1">
                        <div className="font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> Guest</div>
                        <div>{guest.full_name || "—"}</div>
                        <div className="text-muted-foreground">{guest.email || "—"}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-sm space-y-1">
                        <div className="font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Stay</div>
                        <div>{selectedUnit?.name ?? "—"}</div>
                        <div className="text-muted-foreground">{stay.check_in} → {stay.check_out} · {formatPrice(finalPrice, policies)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-sm space-y-1">
                        <div className="font-semibold flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Driver</div>
                        <div>{pickup.enabled ? selectedDriver?.name ?? "No driver yet" : "No pickup"}</div>
                        <div className="text-muted-foreground">{selectedDriver?.license_plate ?? pickup.confirmed_airport}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-sm space-y-1">
                        <div className="font-semibold flex items-center gap-2"><PlaneLanding className="h-4 w-4 text-primary" /> Landing</div>
                        <div>{confirmLandingNow ? "Confirm now" : "Guest/staff can confirm later"}</div>
                        <div className="text-muted-foreground">{pickup.flight_number || pickup.international_flight_number || "Flight optional"}</div>
                      </CardContent>
                    </Card>
                  </div>
                  {validation.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTitle>Needs attention</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-5 space-y-1">{validation.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  {result && (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => navigate("/front-desk?view=arrivals")}>View on Arrivals Board</Button>
                      <Button variant="outline" onClick={() => navigate("/bookings")}>Open bookings</Button>
                    </div>
                  )}
                </div>
              )}

              <Separator />
              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" onClick={prevStep} disabled={stepIndex === 0 || isSubmitting}>Back</Button>
                {step !== "review" ? (
                  <Button onClick={nextStep} disabled={!canMoveNext()}>
                    Next <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button onClick={createFlow} disabled={isSubmitting || validation.length > 0 || !!result}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
                    Create booking flow
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Live summary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Guest</span><span className="font-medium text-right truncate">{guest.full_name || "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Room</span><span className="font-medium text-right truncate">{selectedUnit?.name ?? "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dates</span><span className="font-medium text-right">{nights > 0 ? `${nights} nights` : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Total</span><span className="font-medium text-right">{formatPrice(finalPrice, policies)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Driver</span><span className="font-medium text-right truncate">{pickup.enabled ? selectedDriver?.name ?? "Pending" : "No pickup"}</span></div>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Badge variant="secondary">{stay.state}</Badge>
                  {pickup.enabled && <Badge variant="outline">Pickup</Badge>}
                  {confirmLandingNow && <Badge className="bg-success/20 text-[hsl(var(--success))]">Landing confirmed</Badge>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-xs text-muted-foreground space-y-2">
                <p>No death/test account is created here. If the email exists, the booking links to that guest. If not, a real guest account is created for that exact guest only.</p>
                <p>Temporary QA records should be cancelled or deleted after testing from the normal admin surfaces.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
