import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import GuestLayout from "@/components/GuestLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, ArrowRight, Home, Info, MessageCircle, Send } from "lucide-react";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { toast } from "sonner";

const GuestPortal = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: policies } = usePolicySettings();

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["guest-bookings", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("*, units(name, photos, amenities, rules, capacity)").eq("guest_id", user!.id).order("check_in", { ascending: false });
      if (error) throw error; return data;
    },
  });

  const bookingIds = bookings?.map((b) => b.id) ?? [];
  const { data: messages } = useQuery({
    queryKey: ["guest-messages", bookingIds], enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("id, booking_id, content, created_at, sender_id, is_internal").in("booking_id", bookingIds).eq("is_internal", false).order("created_at", { ascending: true });
      if (error) throw error; return data;
    },
  });

  const messagesByBooking = useMemo(() => {
    const map = new Map<string, typeof messages>();
    (messages ?? []).forEach((m) => { if (!map.has(m.booking_id)) map.set(m.booking_id, []); map.get(m.booking_id)!.push(m); });
    return map;
  }, [messages]);

  const { data: units } = useQuery({
    queryKey: ["guest-units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("id, name, description, capacity, base_price, weekend_price, cleaning_fee, min_nights, amenities, photos, group_id, unit_groups(name)").eq("is_active", true).order("name");
      if (error) throw error; return data;
    },
  });

  const groupedUnits = useMemo(() => {
    if (!units) return [];
    const map = new Map<string, { name: string; units: typeof units }>();
    const ungrouped: typeof units = [];
    for (const u of units) {
      if (u.group_id && u.unit_groups?.name) {
        if (!map.has(u.group_id)) map.set(u.group_id, { name: u.unit_groups.name, units: [] });
        map.get(u.group_id)!.units.push(u);
      } else { ungrouped.push(u); }
    }
    return [...Array.from(map.values()), ...(ungrouped.length ? [{ name: t("common.other"), units: ungrouped }] : [])];
  }, [units, t]);

  const cancellationSummary = useMemo(() => {
    if (!policies) return null;
    const freeDays = policies.find((p) => p.key === "free_cancellation_days");
    const partialDays = policies.find((p) => p.key === "partial_refund_days");
    const noRefundHours = policies.find((p) => p.key === "no_refund_hours");
    return { free: freeDays ? Number(freeDays.value) : 7, partial: partialDays ? Number(partialDays.value) : 3, noRefund: noRefundHours ? Number(noRefundHours.value) : 72 };
  }, [policies]);

  const upcomingBookings = bookings?.filter((b) => ["inquiry", "soft_hold", "pending_approval", "pending_deposit", "confirmed"].includes(b.state)) ?? [];
  const activeBookings = bookings?.filter((b) => b.state === "checked_in") ?? [];
  const pastBookings = bookings?.filter((b) => ["completed", "cancelled", "no_show"].includes(b.state)) ?? [];

  return (
    <GuestLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("guestPortal.myStay")}</h1>
          <p className="text-muted-foreground mt-1">{t("guestPortal.subtitle")}</p>
        </div>

        <Tabs defaultValue="bookings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="bookings">{t("guestPortal.myBookings")}</TabsTrigger>
            <TabsTrigger value="listings">{t("guestPortal.listings")}</TabsTrigger>
            <TabsTrigger value="policies">{t("guestPortal.policies")}</TabsTrigger>
          </TabsList>

          <TabsContent value="bookings">
            <div className="space-y-6">
              {activeBookings.length > 0 && <Section title={t("guestPortal.currentlyCheckedIn")}>{activeBookings.map((b) => <GuestBookingCard key={b.id} booking={b} messages={messagesByBooking.get(b.id) ?? []} userId={user?.id} />)}</Section>}
              {upcomingBookings.length > 0 && <Section title={t("guestPortal.upcoming")}>{upcomingBookings.map((b) => <GuestBookingCard key={b.id} booking={b} messages={messagesByBooking.get(b.id) ?? []} userId={user?.id} />)}</Section>}
              {pastBookings.length > 0 && <Section title={t("guestPortal.pastStays")}>{pastBookings.map((b) => <GuestBookingCard key={b.id} booking={b} messages={messagesByBooking.get(b.id) ?? []} userId={user?.id} />)}</Section>}
              {!isLoading && !bookings?.length && (
                <div className="text-center py-16">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">{t("guestPortal.noBookings")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("guestPortal.browseListings")}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="listings">
            <div className="space-y-6">
              {groupedUnits.map((group) => (
                <div key={group.name}>
                  {groupedUnits.length > 1 && <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.name}</h3>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {group.units.map((unit) => (
                      <Card key={unit.id} className="overflow-hidden">
                        {unit.photos && unit.photos.length > 0 && <div className="aspect-[16/9] overflow-hidden"><img src={unit.photos[0]} alt={unit.name} className="w-full h-full object-cover" /></div>}
                        <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Home className="h-4 w-4 text-primary" />{unit.name}</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          {unit.description && <p className="text-sm text-muted-foreground">{unit.description}</p>}
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge variant="outline">{t("units.upToGuests", { count: unit.capacity })}</Badge>
                            <Badge variant="outline">{t("units.minNightsLabel", { count: unit.min_nights })}</Badge>
                          </div>
                          {(unit.amenities?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {unit.amenities!.slice(0, 8).map((a, i) => <Badge key={i} variant="secondary" className="text-[10px]">{a}</Badge>)}
                              {(unit.amenities!.length > 8) && <Badge variant="secondary" className="text-[10px]">{t("guestPortal.more", { count: unit.amenities!.length - 8 })}</Badge>}
                            </div>
                          )}
                          <Separator />
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t("common.from")}</span>
                            <span className="font-semibold text-foreground">${Number(unit.base_price).toFixed(0)}{t("common.perNight")}</span>
                          </div>
                          {Number(unit.weekend_price ?? 0) > 0 && (
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{t("guestPortal.weekendRate")}</span>
                              <span>${Number(unit.weekend_price).toFixed(0)}{t("common.perNight")}</span>
                            </div>
                          )}
                          {Number(unit.cleaning_fee ?? 0) > 0 && (
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{t("guestPortal.cleaningFee")}</span>
                              <span>${Number(unit.cleaning_fee).toFixed(0)}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
              {!units?.length && <p className="text-sm text-muted-foreground text-center py-8">{t("guestPortal.noListings")}</p>}
            </div>
          </TabsContent>

          <TabsContent value="policies">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Info className="h-4 w-4 text-primary" />{t("guestPortal.cancellationTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {cancellationSummary && (
                  <>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground">{t("guestPortal.cancellationPolicy")}</h4>
                      <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
                        <li><span className="font-medium text-foreground">{t("guestPortal.freeCancellation")}</span> {t("guestPortal.freeCancellationDesc", { days: cancellationSummary.free })}</li>
                        <li><span className="font-medium text-foreground">{t("guestPortal.partialRefund")}</span> {t("guestPortal.partialRefundDesc", { min: cancellationSummary.partial, max: cancellationSummary.free })}</li>
                        <li><span className="font-medium text-foreground">{t("guestPortal.noRefundPolicy")}</span> {t("guestPortal.noRefundDesc", { hours: cancellationSummary.noRefund })}</li>
                      </ul>
                    </div>
                    <Separator />
                  </>
                )}
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">{t("guestPortal.checkInOut")}</h4>
                  <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
                    <li>{t("guestPortal.checkInFrom")} <span className="font-medium text-foreground">{policies?.find((p) => p.key === "earliest_checkin_time")?.value as string ?? "4:00 PM"}</span></li>
                    <li>{t("guestPortal.checkOutBy")} <span className="font-medium text-foreground">{policies?.find((p) => p.key === "checkout_time")?.value as string ?? "11:00 AM"}</span></li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </GuestLayout>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function GuestBookingCard({ booking, messages, userId }: { booking: any; messages: any[]; userId?: string }) {
  const { t } = useTranslation();
  const [showMessages, setShowMessages] = useState(false);
  const [reply, setReply] = useState("");
  const queryClient = useQueryClient();
  const state = booking.state as BookingState;

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("messages").insert({ booking_id: booking.id, content, sender_id: userId!, is_internal: false });
      if (error) throw error;
    },
    onSuccess: () => { setReply(""); queryClient.invalidateQueries({ queryKey: ["guest-messages"] }); toast.success(t("messages.messageSent")); },
    onError: () => toast.error(t("messages.messageFailed")),
  });

  const handleSend = () => { const trimmed = reply.trim(); if (!trimmed || !userId) return; sendMessage.mutate(trimmed); };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{booking.units?.name ?? "—"}</span>
              <Badge className={STATE_VARIANTS[state]}>{t(`states.${state}`)}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{format(new Date(booking.check_in), "MMM d, yyyy")}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{format(new Date(booking.check_out), "MMM d, yyyy")}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t("bookings.guestCount", { count: booking.num_guests })}</p>
          </div>
          {booking.total_price != null && (
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-foreground">${Number(booking.total_price).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t("common.total")}</p>
            </div>
          )}
        </div>
        {booking.notes && <p className="text-sm text-muted-foreground mt-2 italic">"{booking.notes}"</p>}

        <div className="mt-3">
          <button onClick={() => setShowMessages((v) => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <MessageCircle className="h-3.5 w-3.5" />
            {t("messages.title")} {messages.length > 0 && `(${messages.length})`}
          </button>
          {showMessages && (
            <div className="mt-2 space-y-2">
              {messages.length === 0 && <p className="text-xs text-muted-foreground">{t("messages.noMessages")}</p>}
              {messages.map((m) => (
                <div key={m.id} className={`text-sm p-2 rounded-md ${m.sender_id === userId ? "bg-primary/10 text-foreground ml-6" : "bg-muted text-foreground mr-6"}`}>
                  <p>{m.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(m.created_at), "MMM d, h:mm a")}
                    {m.sender_id === userId ? ` · ${t("common.you")}` : ` · ${t("common.staff")}`}
                  </p>
                </div>
              ))}
              {!["completed", "cancelled", "no_show"].includes(booking.state) && userId && (
                <div className="flex gap-2 mt-2">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("messages.typeMessage")} className="min-h-[60px] text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
                  <Button size="icon" variant="outline" onClick={handleSend} disabled={!reply.trim() || sendMessage.isPending} className="shrink-0 self-end">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default GuestPortal;
