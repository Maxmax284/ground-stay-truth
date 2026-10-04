import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMarkMessagesRead } from "@/hooks/useBookings";
import { supabase } from "@/integrations/supabase/client";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchErrorState } from "@/components/FetchErrorState";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { MessageSquare, Search, User, CalendarDays, Circle } from "lucide-react";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { GuestThreadDialog } from "@/components/GuestThreadDialog";
import { Button } from "@/components/ui/button";
import { Reply } from "lucide-react";
import { MessageSourceBadge } from "@/components/MessageSourceBadge";

interface InboxThread {
  booking_id: string;
  unit_name: string;
  guest_name: string | null;
  state: BookingState;
  check_in: string;
  check_out: string;
  last_message_at: string;
  last_message_content: string;
  last_message_is_internal: boolean;
  last_message_source: string | null;
  total_messages: number;
  unread_count: number;
}

function useInboxThreads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inbox-threads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: messages, error: mErr } = await supabase
        .from("messages")
        .select("id, booking_id, content, is_internal, sender_id, created_at, read_at, source")
        .order("created_at", { ascending: false });
      if (mErr) throw mErr;
      if (!messages || messages.length === 0) return [];
      const bookingIds = [...new Set(messages.map((m) => m.booking_id))];
      const { data: bookings, error: bErr } = await (supabase
        .from("bookings")
        .select("id, state, check_in, check_out, units(name), manual_guest_name, manual_guest_email, manual_guest_phone, profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .in("id", bookingIds) as any);
      if (bErr) throw bErr;
      const bookingMap = new Map<string, any>();
      for (const b of bookings ?? []) bookingMap.set(b.id, b);
      const threadMap = new Map<string, InboxThread>();
      for (const msg of messages) {
        if (threadMap.has(msg.booking_id)) {
          const t = threadMap.get(msg.booking_id)!;
          t.total_messages++;
          if (msg.sender_id !== user?.id && !(msg as any).read_at) t.unread_count++;
          continue;
        }
        const booking = bookingMap.get(msg.booking_id);
        if (!booking) continue;
        threadMap.set(msg.booking_id, {
          booking_id: msg.booking_id, unit_name: booking.units?.name ?? "Unknown Unit",
          guest_name: resolveGuestDisplayName(booking as any), state: booking.state as BookingState,
          check_in: booking.check_in, check_out: booking.check_out,
          last_message_at: msg.created_at, last_message_content: msg.content,
          last_message_is_internal: msg.is_internal,
          last_message_source: (msg as any).source ?? null, total_messages: 1,
          unread_count: (msg.sender_id !== user?.id && !(msg as any).read_at) ? 1 : 0,
        });
      }
      return Array.from(threadMap.values()).sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
    },
  });
}

function useMessagesRealtime(onNewMessage?: () => void) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel("inbox-realtime").on(
      "postgres_changes", { event: "*", schema: "public", table: "messages" },
      (payload) => {
        qc.invalidateQueries({ queryKey: ["inbox-threads"] });
        const bookingId = (payload.new as any)?.booking_id ?? (payload.old as any)?.booking_id;
        if (bookingId) qc.invalidateQueries({ queryKey: ["bookingMessages", bookingId] });
        if (payload.eventType === "INSERT" && onNewMessage) onNewMessage();
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, onNewMessage]);
}

const Messages = () => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { play } = useSoundEffects();
  const { data: threads, isLoading, isError, refetch } = useInboxThreads();
  const handleNewMessage = useRef(() => play("message")).current;
  useMessagesRealtime(handleNewMessage);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "today" | "here" | "upcoming">("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [threadBookingId, setThreadBookingId] = useState<string | null>(null);
  const markRead = useMarkMessagesRead();

  // Deep link: /messages?booking=<id> opens that booking's thread directly
  // (used by the Booking Status page's "Message guest" chase action).
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkBooking = searchParams.get("booking");
  useEffect(() => {
    if (!deepLinkBooking || !threads?.length) return;
    if (threads.some((th) => th.booking_id === deepLinkBooking)) {
      setThreadBookingId(deepLinkBooking);
      markRead.mutate(deepLinkBooking);
    }
    setSearchParams((prev) => {
      prev.delete("booking");
      return prev;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkBooking, threads]);

  const activeThread = (threads ?? []).find((th) => th.booking_id === threadBookingId) ?? null;

  // Default click = reply straight away. The full booking sheet stays one tap away.
  const handleOpenThread = (bookingId: string) => {
    setThreadBookingId(bookingId);
    markRead.mutate(bookingId);
  };

  // Who is walking through the door, in the desk's own words.
  const matchesScope = (th: InboxThread) => {
    if (scope === "all") return true;
    const checkIn = new Date(th.check_in);
    if (scope === "here") return th.state === "checked_in";
    if (scope === "today") return th.state !== "checked_in" && isToday(checkIn);
    return th.state !== "checked_in" && !isToday(checkIn) && checkIn.getTime() > Date.now();
  };

  const filtered = (threads ?? []).filter((th) => {
    if (!matchesScope(th)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return th.unit_name.toLowerCase().includes(q) || (th.guest_name?.toLowerCase().includes(q) ?? false) || th.last_message_content.toLowerCase().includes(q);
  });

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4" data-ai-focus="messages">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">{t("messages.title")}</h1>
          {threads && threads.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("messages.conversations", { count: threads.length })}
            </Badge>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("messages.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t("messages.filterLabel", "Filter conversations") as string}>
          {([
            ["all", t("messages.filterAll", "Everyone")],
            ["today", t("messages.filterToday", "Arriving today")],
            ["here", t("messages.filterHere", "Here now")],
            ["upcoming", t("messages.filterUpcoming", "Coming later")],
          ] as const).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={scope === key ? "default" : "outline"}
              aria-pressed={scope === key}
              className="h-7 text-xs"
              onClick={() => setScope(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : isError ? (
          <FetchErrorState message="Unable to load messages" onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{search ? t("messages.noSearchResults") : t("messages.noConversations")}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(100vh-14rem)]">
            <div className="space-y-2">
              {filtered.map((thread) => (
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
                        <span className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {thread.guest_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{thread.guest_name}</span>}
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{format(new Date(thread.check_in), "MMM d")} – {format(new Date(thread.check_out), "MMM d")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {thread.last_message_is_internal && <span className="text-xs font-medium text-secondary-foreground mr-1">[{t("messages.internal")}]</span>}
                        <MessageSourceBadge source={thread.last_message_source} className="text-[10px] mr-1.5 align-middle" />
                        {thread.last_message_content}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t("messages.messageCount", { count: thread.total_messages })}</span>
                        {thread.unread_count > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">{t("messages.newCount", { count: thread.unread_count })}</Badge>}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs gap-1 ml-auto"
                          onClick={(e) => { e.stopPropagation(); handleOpenThread(thread.booking_id); }}
                        >
                          <Reply className="h-3 w-3" />
                          {t("messages.reply")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
      <GuestThreadDialog
        bookingId={threadBookingId}
        open={!!threadBookingId}
        onOpenChange={(open) => !open && setThreadBookingId(null)}
        headline={activeThread?.unit_name}
        guestName={activeThread?.guest_name}
        onOpenBooking={() => {
          const id = threadBookingId;
          setThreadBookingId(null);
          setSelectedBookingId(id);
        }}
      />
      <BookingDetailSheet bookingId={selectedBookingId} open={!!selectedBookingId} onOpenChange={(open) => !open && setSelectedBookingId(null)} isAdmin={isAdmin} />
    </DashboardLayout>
  );
};

export default Messages;
