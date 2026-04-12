import { useState, useMemo, useEffect, useCallback } from "react";
import { AmenityList } from "@/components/AmenityBadge";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMarkMessagesRead } from "@/hooks/useBookings";
import { format, startOfMonth, addMonths, subMonths, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeMessageContent } from "@/lib/sanitize";
import { useAuth } from "@/hooks/useAuth";
import { useGuestHistory } from "@/hooks/useGuestHistory";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { getDepositPolicy } from "@/lib/depositPolicy";
import { useSearchParams } from "react-router-dom";
import GuestLayout from "@/components/GuestLayout";
import ProfileEditor from "@/components/ProfileEditor";
import { CalendarMonthView } from "@/components/CalendarMonthView";
import { GuestBookingRequestForm } from "@/components/GuestBookingRequestForm";
import { GuestDocumentUpload } from "@/components/GuestDocumentUpload";
import { calculateRefund } from "@/lib/refundCalculator";
import { formatPrice } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { CarouselDots } from "@/components/CarouselDots";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CalendarDays, ArrowRight, Home, Info, MessageCircle, Send,
  ChevronLeft, ChevronRight, Eye, CalendarPlus, User, Circle,
  MessageSquare, FileText, XCircle, Wrench, ClipboardCheck,
  Clock, ListChecks, Shield, MapPin, Heart, Star,
} from "lucide-react";
import { GuestStaySupport } from "@/components/GuestStaySupport";
import { GuestStaySummary } from "@/components/GuestStaySummary";
import { GuestPickupCard } from "@/components/GuestPickupCard";
import { GuestDepositSection } from "@/components/GuestDepositSection";
import { GuestPaymentSummary } from "@/components/GuestPaymentSummary";
import { PreArrivalChecklist } from "@/components/PreArrivalChecklist";
import { GuestStayUpdatesPrompt } from "@/components/GuestStayUpdatesPrompt";
import { GuestHeadsUpStrip } from "@/components/GuestHeadsUpStrip";
import { GuestPlaybook } from "@/components/GuestPlaybook";
import { ReviewFormDialog } from "@/components/ReviewFormDialog";
import { StarRating } from "@/components/StarRating";
import { useGuestReviews } from "@/hooks/useReviews";
import { useProfile } from "@/hooks/useProfile";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { toast } from "sonner";

// Inline photo carousel for room type cards
function RoomPhotoCarousel({ photos, name }: { photos: string[]; name: string }) {
  const [api, setApi] = useState<CarouselApi>();
  return (
    <div>
      <div className="relative">
        <Carousel className="w-full" opts={{ loop: true }} setApi={setApi}>
          <CarouselContent>
            {photos.map((photo, i) => (
              <CarouselItem key={i}>
                <div className="aspect-[16/9] overflow-hidden">
                  <img src={photo} alt={`${name} ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {photos.length > 1 && (
            <>
              <CarouselPrevious className="left-2 h-8 w-8 opacity-70 hover:opacity-100" />
              <CarouselNext className="right-2 h-8 w-8 opacity-70 hover:opacity-100" />
            </>
          )}
        </Carousel>
      </div>
      <CarouselDots api={api} count={photos.length} />
    </div>
  );
}

const GuestPortal = () => {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { data: policies } = usePolicySettings();
  const { data: guestHistory } = useGuestHistory(user?.id);
  const { data: guestReviews } = useGuestReviews(user?.id);
  const { profile: profileQuery } = useProfile();
  const guestName = profileQuery.data?.full_name ?? null;
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true" && role === "admin";
  const queryClient = useQueryClient();

  // Month view state for Calendar tab
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  // Booking request dialog
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [bookingFormUnitId, setBookingFormUnitId] = useState<string | undefined>();

  // Auto-open booking form when arriving with ?unit=<id> from the Stay page
  // Also handle ?action=landed for deep-linking from flight landed notifications
  useEffect(() => {
    const unitFromUrl = searchParams.get("unit");
    if (unitFromUrl && !bookingFormOpen) {
      setBookingFormUnitId(unitFromUrl);
      setBookingFormOpen(true);
    }
    const actionFromUrl = searchParams.get("action");
    if (actionFromUrl === "landed") {
      setFocusSection("landed");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Active tab state (controlled for action-button navigation)
  const [activeTab, setActiveTab] = useState("bookings");

  const [focusSection, setFocusSection] = useState<string | null>(null);

  // Listen for tab-switch events from action buttons
  useEffect(() => {
    const handler = (e: CustomEvent<{ tab: string; section?: string }>) => {
      const tab = e.detail?.tab;
      if (tab) setActiveTab(tab);
      setFocusSection(e.detail?.section ?? null);
    };
    window.addEventListener("guest-portal-action", handler as EventListener);
    return () => window.removeEventListener("guest-portal-action", handler as EventListener);
  }, []);

  // Messages tab state
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const markRead = useMarkMessagesRead();

  const handleOpenThread = (bookingId: string) => {
    setSelectedThread(bookingId);
    markRead.mutate(bookingId);
  };

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["guest-bookings", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("*, units(name, photos, amenities, rules, capacity, reviews_enabled)").eq("guest_id", user!.id).order("check_in", { ascending: false });
      if (error) throw error; return data;
    },
  });

  const bookingIds = bookings?.map((b) => b.id) ?? [];

  // Check if any of the guest's bookings have training links
  const { data: guestTrainingLinks } = useQuery({
    queryKey: ["guest-training-links", bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_training_links")
        .select("id, booking_id, training_packages(name, duration_days, price)")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data;
    },
  });
  const hasTrainingAssociation = (guestTrainingLinks ?? []).length > 0;


  const { data: messages } = useQuery({
    queryKey: ["guest-messages", bookingIds], enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("id, booking_id, content, created_at, sender_id, is_internal").in("booking_id", bookingIds).eq("is_internal", false).order("created_at", { ascending: true });
      if (error) throw error; return data;
    },
  });

  // Realtime for messages
  useEffect(() => {
    if (bookingIds.length === 0) return;
    const channel = supabase.channel("guest-messages-realtime").on(
      "postgres_changes", { event: "*", schema: "public", table: "messages" },
      () => {
        queryClient.invalidateQueries({ queryKey: ["guest-messages"] });
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingIds.join(","), queryClient]);

  const messagesByBooking = useMemo(() => {
    const map = new Map<string, typeof messages>();
    (messages ?? []).forEach((m) => { if (!map.has(m.booking_id)) map.set(m.booking_id, []); map.get(m.booking_id)!.push(m); });
    return map;
  }, [messages]);

  // Build inbox threads for Messages tab
  const inboxThreads = useMemo(() => {
    if (!bookings || !messages) return [];
    return bookings
      .map((b) => {
        const msgs = messagesByBooking.get(b.id) ?? [];
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const unread = msgs.filter((m) => m.sender_id !== user?.id && !(m as any).read_at).length;
        return {
          booking_id: b.id,
          unit_name: b.units?.name ?? "—",
          state: b.state as BookingState,
          check_in: b.check_in,
          check_out: b.check_out,
          total_messages: msgs.length,
          unread_count: unread,
          last_message_at: lastMsg?.created_at ?? b.created_at,
          last_message_content: lastMsg?.content ?? "",
        };
      })
      .filter((t) => t.total_messages > 0 || !["completed", "cancelled", "no_show"].includes(t.state))
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
  }, [bookings, messages, messagesByBooking, user?.id]);

  const { data: units } = useQuery({
    queryKey: ["guest-units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("id, name, description, capacity, base_price, weekend_price, cleaning_fee, min_nights, amenities, photos, group_id, unit_groups(name)").eq("is_active", true).order("name");
      if (error) throw error; return data;
    },
  });

  // Build one card per room type, sorted highest price → lowest (premium first)
  const roomTypeCards = useMemo(() => {
    if (!units) return [];
    const map = new Map<string, { groupId: string; name: string; description: string | null; units: typeof units }>();
    for (const u of units) {
      if (u.group_id && u.unit_groups?.name) {
        if (!map.has(u.group_id)) map.set(u.group_id, { groupId: u.group_id, name: u.unit_groups.name, description: u.description, units: [] });
        map.get(u.group_id)!.units.push(u);
      }
    }
    return Array.from(map.values())
      .map((g) => {
        const rep = g.units.reduce((best, u) => (u.base_price > best.base_price ? u : best), g.units[0]);
        return {
          groupId: g.groupId,
          name: g.name,
          description: g.description ?? rep.description,
          capacity: rep.capacity,
          base_price: rep.base_price,
          weekend_price: rep.weekend_price,
          cleaning_fee: rep.cleaning_fee,
          min_nights: rep.min_nights,
          amenities: rep.amenities,
          photos: rep.photos,
          unitCount: g.units.length,
        };
      })
      .sort((a, b) => a.base_price - b.base_price);
  }, [units]);

  const cancellationSummary = useMemo(() => {
    if (!policies) return null;
    const freeDays = policies.find((p) => p.key === "free_cancellation_days");
    const partialDays = policies.find((p) => p.key === "partial_refund_days");
    const noRefundHours = policies.find((p) => p.key === "no_refund_hours");
    return { free: freeDays ? Number(freeDays.value) : 7, partial: partialDays ? Number(partialDays.value) : 3, noRefund: noRefundHours ? Number(noRefundHours.value) : 72 };
  }, [policies]);

  const upcomingBookings = bookings?.filter((b) => ["inquiry", "soft_hold", "pending_approval", "pending_deposit", "confirmed"].includes(b.state)) ?? [];
  const confirmedBookings = bookings?.filter((b) => b.state === "confirmed") ?? [];
  const activeBookings = bookings?.filter((b) => b.state === "checked_in") ?? [];
  const pastBookings = bookings?.filter((b) => ["completed", "cancelled", "no_show"].includes(b.state)) ?? [];

  // Derive location tags from bookings for intelligence filtering
  const guestLocations = useMemo(() => {
    const relevantBookings = [...activeBookings, ...confirmedBookings, ...upcomingBookings];
    const locs = new Set<string>();
    for (const b of relevantBookings) {
      const details = b.arrival_details as Record<string, any> | null;
      if (details?.confirmed_airport === "BKK" || details?.arrival_type === "flight") locs.add("bkk");
      if (details?.confirmed_airport === "USM" || details?.arrival_location_type === "airport") locs.add("samui");
      if (details?.arrival_type === "ferry") { locs.add("nathon"); locs.add("lipa_noi"); }
      if (details?.arrival_type === "bus") locs.add("bus");
      if (activeBookings.length > 0) locs.add("island");
      if (details?.confirmed_airport === "BKK" && (details?.arrival_location_type !== "airport" || details?.arrival_type === "flight")) locs.add("transit");
    }
    return locs.size > 0 ? [...locs] : undefined;
  }, [activeBookings, confirmedBookings, upcomingBookings]);

  // Derive journey phase for contextual intel
  const journeyPhase = useMemo((): "pre_arrival" | "transit" | "arrival" | "stay" | "departure" | undefined => {
    if (activeBookings.length > 0) {
      // Check if any active booking is near check-out
      const nearCheckout = activeBookings.some((b) => {
        const co = new Date(b.check_out);
        const now = new Date();
        const hoursLeft = (co.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursLeft <= 24 && hoursLeft > 0;
      });
      return nearCheckout ? "departure" : "stay";
    }
    if (confirmedBookings.length > 0) {
      const soonest = confirmedBookings.reduce((a, b) =>
        new Date(a.check_in) < new Date(b.check_in) ? a : b
      );
      const details = soonest.arrival_details as Record<string, any> | null;
      const hoursToCheckin = (new Date(soonest.check_in).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursToCheckin <= 12) {
        if (details?.guest_landed_at && details?.confirmed_airport === "BKK") return "transit";
        return "arrival";
      }
      return "pre_arrival";
    }
    return undefined;
  }, [activeBookings, confirmedBookings]);

  const openBookingForm = (unitId?: string) => {
    setBookingFormUnitId(unitId);
    setBookingFormOpen(true);
  };

  return (
    <GuestLayout>
      <div className="space-y-6">
        {isPreview && (
          <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 text-warning-foreground rounded-lg px-4 py-2 text-sm">
            <Eye className="h-4 w-4 shrink-0" />
            {t("guestPortal.previewBanner")}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("guestPortal.myStay")}</h1>
            <p className="text-muted-foreground text-sm mt-0.5 sm:mt-1">{t("guestPortal.subtitle")}</p>
          </div>
        </div>

        {guestHistory?.isReturning && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Heart className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("loyalty.welcomeBack")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("loyalty.stayCount", { count: (guestHistory.completedStays ?? 0) + 1 })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Passive Layer: Your Stay Summary */}
        <GuestStaySummary focusSection={focusSection} onSectionFocused={() => setFocusSection(null)} />

        {/* Heads Up — contextual, journey-aware intelligence carousel */}
        <GuestHeadsUpStrip
          locations={guestLocations}
          journeyPhase={journeyPhase}
          onLearnMore={(entry) => {
            setActiveTab("island-guide");
          }}
        />

        {/* Guest notification enrollment — benefit-framed, not technical */}
        <GuestStayUpdatesPrompt />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="bookings">{t("guestPortal.myBookings")}</TabsTrigger>
            <TabsTrigger value="listings">{t("guestPortal.listings")}</TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center gap-1.5">
              {t("messages.title")}
              {inboxThreads.some((t) => t.unread_count > 0) && (
                <Circle className="h-2 w-2 fill-primary text-primary" />
              )}
            </TabsTrigger>
            {activeBookings.length > 0 && (
              <TabsTrigger value="stay-support" className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                {t("staySupport.tabLabel")}
              </TabsTrigger>
            )}
            {confirmedBookings.length > 0 && (
              <TabsTrigger value="pre-arrival" className="flex items-center gap-1.5">
                <ClipboardCheck className="h-3.5 w-3.5" />
                {t("preArrival.title", "Pre-Arrival")}
              </TabsTrigger>
            )}
            <TabsTrigger value="calendar">{t("nav.calendar")}</TabsTrigger>
            {hasTrainingAssociation && (
              <TabsTrigger value="camp-info">{t("guestPortal.campInfo")}</TabsTrigger>
            )}
            <TabsTrigger value="island-guide" className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Island Guide
            </TabsTrigger>
            <TabsTrigger value="policies">{t("guestPortal.policies")}</TabsTrigger>
            <TabsTrigger value="profile">{t("guestPortal.profile")}</TabsTrigger>
          </TabsList>

          {/* ── Bookings Tab ── */}
          <TabsContent value="bookings">
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button onClick={() => openBookingForm()} size="sm">
                  <CalendarPlus className="h-4 w-4 mr-1.5" />
                  {t("guestBooking.requestBooking")}
                </Button>
              </div>
              {activeBookings.length > 0 && <Section title={t("guestPortal.currentlyCheckedIn")}>{activeBookings.map((b) => <GuestBookingCard key={b.id} booking={b} messages={messagesByBooking.get(b.id) ?? []} userId={user?.id} policies={policies ?? undefined} guestReviews={guestReviews} guestName={guestName} />)}</Section>}
              {upcomingBookings.length > 0 && <Section title={t("guestPortal.upcoming")}>{upcomingBookings.map((b) => <GuestBookingCard key={b.id} booking={b} messages={messagesByBooking.get(b.id) ?? []} userId={user?.id} policies={policies ?? undefined} guestReviews={guestReviews} guestName={guestName} />)}</Section>}
              {pastBookings.length > 0 && <Section title={t("guestPortal.pastStays")}>{pastBookings.map((b) => <GuestBookingCard key={b.id} booking={b} messages={messagesByBooking.get(b.id) ?? []} userId={user?.id} policies={policies ?? undefined} guestReviews={guestReviews} guestName={guestName} />)}</Section>}
              {!isLoading && !bookings?.length && (
                <div className="text-center py-16">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">{t("guestPortal.noBookings")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("guestPortal.browseListings")}</p>
                  <Button onClick={() => openBookingForm()} variant="outline" className="mt-4">
                    <CalendarPlus className="h-4 w-4 mr-1.5" />
                    {t("guestBooking.requestBooking")}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Listings Tab ── */}
          <TabsContent value="listings">
            <div className="space-y-4">
              {roomTypeCards.map((room) => (
                <Card key={room.groupId} className="overflow-hidden">
                  {room.photos && room.photos.length > 0 && (
                    <RoomPhotoCarousel photos={room.photos} name={room.name} />
                  )}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2"><Home className="h-4 w-4 text-primary" />{room.name}</CardTitle>
                    {room.unitCount > 1 && <p className="text-xs text-muted-foreground">{room.unitCount} {t("guestPortal.roomsAvailable", { defaultValue: "rooms available" })}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {room.description && <p className="text-sm text-muted-foreground">{room.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{t("units.upToGuests", { count: room.capacity })}</Badge>
                      <Badge variant="outline">{t("units.minNightsLabel", { count: room.min_nights })}</Badge>
                    </div>
                    <AmenityList amenities={room.amenities} max={8} />
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("common.from")}</span>
                      <span className="text-lg font-bold text-foreground">{formatPrice(room.base_price, policies, { decimals: 0 })}<span className="text-sm font-normal text-muted-foreground">{t("common.perNight")}</span></span>
                    </div>
                    <Button onClick={() => openBookingForm()} size="sm" className="w-full mt-2">
                      <CalendarPlus className="h-4 w-4 mr-1.5" />
                      {t("guestBooking.requestBooking")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {!roomTypeCards.length && <p className="text-sm text-muted-foreground text-center py-8">{t("guestPortal.noListings")}</p>}
            </div>
          </TabsContent>

          {/* ── Stay Support Tab ── */}
          {activeBookings.length > 0 && (
            <TabsContent value="stay-support">
              <GuestStaySupport
                focusSection={focusSection}
                onSectionFocused={() => setFocusSection(null)}
                bookings={activeBookings.map((b) => ({
                  id: b.id,
                  unit_id: b.unit_id,
                  units: b.units ? { name: b.units.name } : null,
                }))}
              />
            </TabsContent>
          )}

          {/* ── Pre-Arrival Tab ── */}
          {confirmedBookings.length > 0 && (
            <TabsContent value="pre-arrival">
              <div className="space-y-4">
                {confirmedBookings.map((b) => (
                  <div key={b.id} className="space-y-2">
                    {confirmedBookings.length > 1 && (
                      <h3 className="text-sm font-semibold text-muted-foreground">{b.units?.name ?? "—"}</h3>
                    )}
                    <PreArrivalChecklist bookingId={b.id} />
                  </div>
                ))}
              </div>
            </TabsContent>
          )}

          {/* ── Messages Tab ── */}
          <TabsContent value="messages">
            <div className="space-y-4">
              {selectedThread ? (
                <GuestThreadView
                  bookingId={selectedThread}
                  booking={bookings?.find((b) => b.id === selectedThread)}
                  messages={messagesByBooking.get(selectedThread) ?? []}
                  userId={user?.id}
                  onBack={() => setSelectedThread(null)}
                />
              ) : (
                <>
                  {inboxThreads.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">{t("messages.noConversations")}</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[calc(100vh-16rem)]">
                      <div className="space-y-2">
                        {inboxThreads.map((thread) => (
                          <Card key={thread.booking_id} className="p-4 cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => handleOpenThread(thread.booking_id)}>
                            <div className="flex items-start gap-3">
                              <div className="pt-1.5 shrink-0">
                                {thread.unread_count > 0 ? <Circle className="h-2.5 w-2.5 fill-primary text-primary" /> : <Circle className="h-2.5 w-2.5 text-transparent" />}
                              </div>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-semibold text-sm truncate">{thread.unit_name}</span>
                                    <Badge className={`text-[10px] shrink-0 ${STATE_VARIANTS[thread.state]}`}>{t(`states.${thread.state}`)}</Badge>
                                  </div>
                                  {thread.last_message_content && (
                                    <span className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{format(new Date(thread.check_in), "MMM d")} – {format(new Date(thread.check_out), "MMM d")}</span>
                                </div>
                                {thread.last_message_content && (
                                  <p className="text-sm text-muted-foreground truncate">{thread.last_message_content}</p>
                                )}
                                {thread.total_messages > 0 && (
                                  <span className="text-xs text-muted-foreground">{t("messages.messageCount", { count: thread.total_messages })}</span>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Calendar Tab ── */}
          <TabsContent value="calendar">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {format(calMonth, "MMMM yyyy")}
                </h3>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCalMonth((m) => subMonths(m, 1))}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCalMonth(startOfMonth(new Date()))}>
                    {t("common.today")}
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCalMonth((m) => addMonths(m, 1))}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <CalendarMonthView
                currentMonth={calMonth}
                bookings={bookings ?? []}
                readOnly
                guestId={isPreview ? undefined : user?.id}
              />
              {!bookings?.length && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("guestPortal.noBookings")}
                </p>
              )}
            </div>
          </TabsContent>

          {/* ── Camp Info Tab (only for guests with training links) ── */}
          {hasTrainingAssociation && (
            <TabsContent value="camp-info">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Info className="h-4 w-4 text-primary" />{t("guestPortal.campInfo")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <CampInfoAccordion policies={policies ?? []} />
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-semibold text-foreground">{t("guestPortal.checkInOut")}</h4>
                    <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
                      <li>{t("guestPortal.checkInFrom")} <span className="font-medium text-foreground">{String(policies?.find((p) => p.key === "earliest_checkin_time")?.value ?? "16:00").replace(/^"|"$/g, "")}</span></li>
                      <li>{t("guestPortal.checkOutBy")} <span className="font-medium text-foreground">{String(policies?.find((p) => p.key === "checkout_time")?.value ?? "11:00").replace(/^"|"$/g, "")}</span></li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Island Guide Tab ── */}
          <TabsContent value="island-guide">
            <GuestPlaybook locations={guestLocations} />
          </TabsContent>

          {/* ── Policies Tab ── */}
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

          {/* ── Profile Tab ── */}
          <TabsContent value="profile">
            <ProfileEditor />
          </TabsContent>
        </Tabs>
      </div>

      <GuestBookingRequestForm
        open={bookingFormOpen}
        onOpenChange={setBookingFormOpen}
        defaultUnitId={bookingFormUnitId}
      />
    </GuestLayout>
  );
};

/* ── Helper Components ── */

function DepositBanner({ policies, depositAmount, bookingId }: { policies?: any[]; depositAmount: number | null; bookingId: string }) {
  return (
    <GuestDepositSection
      policies={policies}
      depositAmount={depositAmount}
      bookingId={bookingId}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function GuestBookingCard({ booking, messages, userId, policies, guestReviews, guestName }: { booking: any; messages: any[]; userId?: string; policies?: any[]; guestReviews?: any[]; guestName?: string | null }) {
  const { t } = useTranslation();
  const [showMessages, setShowMessages] = useState(false);
  const [reply, setReply] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);

  // Training association check
  const { data: bookingTrainingLinks } = useQuery({
    queryKey: ["booking_training_links", booking.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_training_links")
        .select("*, training_packages(name, duration_days, price)")
        .eq("booking_id", booking.id);
      if (error) throw error;
      return data;
    },
  });
  const queryClient = useQueryClient();
  const state = booking.state as BookingState;
  const showDocUpload = ["confirmed", "pending_deposit", "pending_approval"].includes(state);
  const cancellableStates: BookingState[] = ["inquiry", "soft_hold", "pending_approval", "pending_deposit", "confirmed"];
  const canCancel = cancellableStates.includes(state);
  const existingReview = guestReviews?.find((r: any) => r.booking_id === booking.id);
  const stayNights = useMemo(() => {
    const ci = new Date(booking.check_in);
    const co = new Date(booking.check_out);
    return Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24));
  }, [booking.check_in, booking.check_out]);
  const unitReviewsEnabled = (booking.units as any)?.reviews_enabled !== false;
  const canReview = state === "completed" && !existingReview && !!userId && unitReviewsEnabled;

  // Deposit info for pending_deposit state
  const depositPercentage = useMemo(() => {
    const setting = policies?.find((p: any) => p.key === "deposit_percentage");
    return setting ? Number(setting.value) : 100;
  }, [policies]);

  const depositAmount = useMemo(() => {
    if (!booking.total_price) return null;
    return (Number(booking.total_price) * depositPercentage) / 100;
  }, [booking.total_price, depositPercentage]);

  const refundInfo = useMemo(() => {
    if (!canCancel || !policies) return null;
    return calculateRefund(booking.check_in, booking.total_price, policies);
  }, [canCancel, policies, booking.check_in, booking.total_price]);

  const cancelBooking = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("bookings").update({ state: "cancelled" }).eq("id", booking.id);
      if (error) throw error;
      await supabase.from("booking_state_log").insert({
        booking_id: booking.id,
        from_state: state,
        to_state: "cancelled",
        changed_by: user?.id ?? null,
        reason: "Cancelled by guest",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-bookings"] });
      toast.success(t("guestPortal.bookingCancelled"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const sanitized = sanitizeMessageContent(content);
      if (!sanitized) throw new Error("Message is empty");
      const { error } = await supabase.from("messages").insert({ booking_id: booking.id, content: sanitized, sender_id: userId!, is_internal: false });
      if (error) throw error;

      // Notify staff about new guest message
      try {
        const { data: staffRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "manager", "front_desk", "front_desk_supervisor"]);
        if (staffRoles && staffRoles.length > 0) {
          const unitName = booking.units?.name || "";
          await supabase.functions.invoke("create-notification", {
            body: {
              notifications: staffRoles
                .filter((s) => s.user_id !== userId)
                .map((s) => ({
                  user_id: s.user_id,
                  type: "message",
                  reference_id: booking.id,
                  message: `New message from guest${unitName ? ` (${unitName})` : ""}: "${sanitized.slice(0, 60)}${sanitized.length > 60 ? "…" : ""}"`,
                })),
            },
          });
        }
      } catch {
        // Non-critical
      }
    },
    onSuccess: () => { setReply(""); queryClient.invalidateQueries({ queryKey: ["guest-messages"] }); toast.success(t("messages.messageSent")); },
    onError: () => toast.error(t("messages.messageFailed")),
  });

  const handleSend = () => { const trimmed = reply.trim(); if (!trimmed || !userId) return; sendMessage.mutate(trimmed); };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
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
              <p className="text-sm font-semibold text-foreground">{formatPrice(booking.total_price, policies)}</p>
              <p className="text-xs text-muted-foreground">{t("common.total")}</p>
            </div>
          )}
        </div>
        {booking.notes && <p className="text-sm text-muted-foreground italic">"{booking.notes}"</p>}

        {/* Deposit info banner for pending_deposit */}
        {state === "pending_deposit" && (
          <DepositBanner policies={policies} depositAmount={depositAmount} bookingId={booking.id} />
        )}

        {/* Payment summary for all non-inquiry bookings */}
        {!["inquiry", "soft_hold"].includes(state) && booking.total_price != null && (
          <GuestPaymentSummary bookingId={booking.id} totalPrice={booking.total_price} policies={policies} />
        )}

        {/* Airport Pickup info */}
        {!["completed", "cancelled", "no_show"].includes(state) && (
          <GuestPickupCard bookingId={booking.id} guestName={guestName} />
        )}

        {/* Training Program info (only shown if booking has training links) */}
        {(bookingTrainingLinks ?? []).length > 0 && !["cancelled", "no_show"].includes(state) && (
          <div className="border rounded-md p-3 space-y-2 bg-accent/30">
            <div className="flex items-center gap-2">
              <Badge className="gap-1 bg-fight-gold text-fight-dark hover:bg-fight-gold/90 text-[10px]">
                🥊 {t("training.programLinked", { defaultValue: "Training Program" })}
              </Badge>
            </div>
            {(bookingTrainingLinks ?? []).map((link: any) => (
              <div key={link.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{link.training_packages?.name}</span>
                {" · "}{link.training_packages?.duration_days} {t("common.days", { defaultValue: "days" })}
                {link.trainer_name && ` · Trainer: ${link.trainer_name}`}
                {link.start_date && ` · Starts ${link.start_date}`}
              </div>
            ))}
          </div>
        )}

        {showDocUpload && (
          <div className="border rounded-md p-3">
            <GuestDocumentUpload bookingId={booking.id} showRequirement />
          </div>
        )}

        {/* Cancel booking */}
        {canCancel && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                {t("guestPortal.cancelBooking")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("guestPortal.cancelBookingTitle")}</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span>{t("guestPortal.cancelBookingDesc")}</span>
                  {refundInfo && (
                    <span className="block mt-2 font-medium">
                      {refundInfo.tier === "free" && t("refund.fullRefund", { days: refundInfo.daysUntilCheckIn })}
                      {refundInfo.tier === "partial" && t("refund.partialRefund", { pct: refundInfo.refundPercentage, days: refundInfo.daysUntilCheckIn })}
                      {refundInfo.tier === "none" && t("refund.noRefund", { days: refundInfo.daysUntilCheckIn })}
                      {refundInfo.refundAmount != null && booking.total_price != null && (
                        <span className="block text-sm mt-1">
                          {t("refund.refundAmount")}: {formatPrice(refundInfo.refundAmount, policies)} {t("refund.ofTotal", { total: formatPrice(booking.total_price, policies) })}
                        </span>
                      )}
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => cancelBooking.mutate()}
                  disabled={cancelBooking.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {cancelBooking.isPending ? t("common.pleaseWait") : t("guestPortal.confirmCancel")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Departure card for completed bookings */}
        {state === "completed" && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {t("guestPortal.thankYou", "Thank you for staying with us!")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("guestPortal.departureMessage", "We hope you had a wonderful stay. Safe travels, and we'd love to welcome you back anytime!")}
              </p>
              {canReview && (
                <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)} className="gap-1.5">
                  <Star className="h-3.5 w-3.5" />
                  {t("reviews.leaveReview")}
                </Button>
              )}
              {existingReview && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StarRating rating={existingReview.rating} size="sm" />
                  <span>{existingReview.status === "pending" ? t("reviews.pendingApproval") : t(`reviews.${existingReview.status}`)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Review dialog */}
        {canReview && (
          <ReviewFormDialog open={reviewOpen} onOpenChange={setReviewOpen} bookingId={booking.id} guestId={userId!} guestName={guestName ?? null} checkOut={booking.check_out} checkIn={booking.check_in} unitName={booking.units?.name} stayNights={stayNights} />
        )}

        {/* Inline messages */}
        <div>
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

function GuestThreadView({ bookingId, booking, messages, userId, onBack }: {
  bookingId: string;
  booking: any;
  messages: any[];
  userId?: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [reply, setReply] = useState("");
  const queryClient = useQueryClient();

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const sanitized = sanitizeMessageContent(content);
      if (!sanitized) throw new Error("Message is empty");
      const { error } = await supabase.from("messages").insert({ booking_id: bookingId, content: sanitized, sender_id: userId!, is_internal: false });
      if (error) throw error;

      // Notify staff about new guest message
      try {
        const { data: staffRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "manager", "front_desk", "front_desk_supervisor"]);
        if (staffRoles && staffRoles.length > 0) {
          await supabase.functions.invoke("create-notification", {
            body: {
              notifications: staffRoles
                .filter((s) => s.user_id !== userId)
                .map((s) => ({
                  user_id: s.user_id,
                  type: "message",
                  reference_id: bookingId,
                  message: `New guest message: "${sanitized.slice(0, 60)}${sanitized.length > 60 ? "…" : ""}"`,
                })),
            },
          });
        }
      } catch {
        // Non-critical
      }
    },
    onSuccess: () => { setReply(""); queryClient.invalidateQueries({ queryKey: ["guest-messages"] }); toast.success(t("messages.messageSent")); },
    onError: () => toast.error(t("messages.messageFailed")),
  });

  const handleSend = () => { const trimmed = reply.trim(); if (!trimmed || !userId) return; sendMessage.mutate(trimmed); };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        {t("guestPortal.backToInbox")}
      </Button>

      {booking && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{booking.units?.name ?? "—"}</span>
          <Badge className={STATE_VARIANTS[booking.state as BookingState]}>{t(`states.${booking.state}`)}</Badge>
          <span>·</span>
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{format(new Date(booking.check_in), "MMM d")} – {format(new Date(booking.check_out), "MMM d")}</span>
        </div>
      )}

      <ScrollArea className="max-h-[calc(100vh-22rem)]">
        <div className="space-y-2">
          {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">{t("messages.noMessages")}</p>}
          {messages.map((m) => (
            <div key={m.id} className={`text-sm p-3 rounded-lg ${m.sender_id === userId ? "bg-primary/10 text-foreground ml-8" : "bg-muted text-foreground mr-8"}`}>
              <p>{m.content}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {format(new Date(m.created_at), "MMM d, h:mm a")}
                {m.sender_id === userId ? ` · ${t("common.you")}` : ` · ${t("common.staff")}`}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>

      {userId && !["completed", "cancelled", "no_show"].includes(booking?.state ?? "") && (
        <div className="flex gap-2">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("messages.typeMessage")} className="min-h-[60px] text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
          <Button size="icon" onClick={handleSend} disabled={!reply.trim() || sendMessage.isPending} className="shrink-0 self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Camp Info Accordion ── */
interface CampInfoSection {
  key: string;
  icon: React.ReactNode;
  labelKey: string;
}

const CAMP_SECTIONS: CampInfoSection[] = [
  { key: "training_schedule", icon: <Clock className="h-4 w-4 text-primary" />, labelKey: "campInfo.trainingSchedule" },
  { key: "what_to_bring", icon: <ListChecks className="h-4 w-4 text-primary" />, labelKey: "campInfo.whatToBring" },
  { key: "gym_rules", icon: <Shield className="h-4 w-4 text-primary" />, labelKey: "campInfo.gymRules" },
  { key: "airport_directions", icon: <MapPin className="h-4 w-4 text-primary" />, labelKey: "campInfo.airportDirections" },
];

function CampInfoAccordion({ policies }: { policies: Array<{ key: string; value: any }> }) {
  const { t } = useTranslation();
  const raw = policies.find((p) => p.key === "camp_info")?.value;

  if (!raw) {
    return <p className="text-muted-foreground">{t("guestPortal.noCampInfo")}</p>;
  }

  // Detect structured vs legacy plain text
  const parsed = typeof raw === "object" && raw !== null ? raw : null;

  if (!parsed) {
    // Legacy flat text fallback
    return (
      <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
        {String(raw).replace(/^"|"$/g, "")}
      </div>
    );
  }

  return (
    <Accordion type="multiple" defaultValue={["training_schedule"]} className="w-full">
      {CAMP_SECTIONS.map((section) => {
        const content = parsed[section.key];
        if (!content) return null;
        return (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                {section.icon}
                {t(section.labelKey)}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                {String(content)}
              </p>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

export default GuestPortal;
