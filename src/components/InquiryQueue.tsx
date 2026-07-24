import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HandMetal, X, MessageSquare, AlertTriangle, Bot, Loader2, Eye, Percent } from "lucide-react";
import { ApplyDiscountDialog } from "@/components/ApplyDiscountDialog";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { format, formatDistanceToNow } from "date-fns";
import { useTransitionBookingState } from "@/hooks/useBookings";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAISettings } from "@/hooks/useAISettings";
import { permissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

interface InquiryQueueProps {
  bookings: any[] | undefined;
  isLoading: boolean;
  readOnly?: boolean;
}

function useAIAdvisory(booking: any, enabled: boolean) {
  const { session, role } = useAuth();
  const [advisory, setAdvisory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !session || !booking) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              mode: "validate",
              role,
              messages: [{ role: "user", content: `Quick check on this inquiry: unit ${booking.units?.name ?? "unknown"}, dates ${booking.check_in} to ${booking.check_out}, ${booking.num_guests} guest(s). Any date overlaps, maintenance blocks, or capacity concerns?` }],
              context: {
                bookingId: booking.id,
                unitId: booking.unit_id,
                unitName: booking.units?.name,
                checkIn: booking.check_in,
                checkOut: booking.check_out,
                numGuests: booking.num_guests,
                transition: "inquiry → soft_hold",
              },
            }),
          }
        );
        if (!resp.ok || !resp.body) { setLoading(false); return; }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let result = "";
        let done = false;
        while (!done) {
          const { done: d, value } = await reader.read();
          if (d) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") { done = true; break; }
            try {
              const parsed = JSON.parse(json);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) result += content;
            } catch {}
          }
        }
        if (!cancelled) setAdvisory(result || null);
      } catch {
        // Non-blocking — ignore errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [booking?.id, enabled, session]);

  return { advisory, loading };
}

function AIAdvisoryBadge({ booking }: { booking: any }) {
  const { role } = useAuth();
  const { isAIEnabled } = useAISettings(role);
  const { advisory, loading } = useAIAdvisory(booking, isAIEnabled);

  if (!isAIEnabled) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : advisory ? (
              <Bot className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Bot className="h-3.5 w-3.5 text-muted-foreground/40" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {loading ? "Kru is checking…" : advisory || "No concerns flagged."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function InquiryQueue({ bookings, isLoading, readOnly = false }: InquiryQueueProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const transition = useTransitionBookingState();
  const qc = useQueryClient();
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const canDismiss = permissions.canDismissInquiry(role);
  const canHold = permissions.canHoldInquiry(role);
  const isAdmin = permissions.canApproveBooking(role);

  const handleHold = async (bookingId: string) => {
    try {
      await transition.mutateAsync({
        bookingId,
        fromState: "inquiry",
        toState: "pending_deposit",
        reason: "Inquiry accepted — deposit requested",
      });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("inquiry.held"));
    } catch {
      toast.error(t("inquiry.actionFailed"));
    }
  };

  const handleDismiss = async () => {
    if (!dismissId || !dismissReason.trim()) return;
    try {
      await transition.mutateAsync({
        bookingId: dismissId,
        fromState: "inquiry",
        toState: "cancelled",
        reason: dismissReason,
      });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("inquiry.dismissed"));
    } catch {
      toast.error(t("inquiry.actionFailed"));
    } finally {
      setDismissId(null);
      setDismissReason("");
    }
  };

  const count = bookings?.length ?? 0;

  return (
    <>
      <Card className={count > 0 ? "border-primary/50" : ""}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t("inquiry.queueTitle")}
            {count > 0 && (
              <Badge variant="default" className="ml-1 text-xs">
                {count}
              </Badge>
            )}
            {readOnly && (
              <Badge variant="outline" className="ml-1 text-xs">{t("common.preview")}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : count === 0 ? (
            <p className="text-sm text-muted-foreground">{t("inquiry.noItems")}</p>
          ) : (
            <div className="space-y-3">
              {bookings!.map((b: any) => {
                const waitTime = formatDistanceToNow(new Date(b.created_at), { addSuffix: true });
                return (
                  <div
                    key={b.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => setDetailBookingId(b.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {b.units?.name ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          · {resolveGuestDisplayName(b)}
                        </span>
                        <AIAdvisoryBadge booking={b} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>
                          {format(new Date(b.check_in), "MMM d")} – {format(new Date(b.check_out), "MMM d")}
                        </span>
                        <span>·</span>
                        <span>{b.num_guests} guest{b.num_guests > 1 ? "s" : ""}</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> {t("inquiry.waiting")} {waitTime}
                        </span>
                      </div>
                      {b.notes && (
                        <p className="text-xs text-muted-foreground mt-1 truncate italic">"{b.notes}"</p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-1.5 flex-wrap sm:flex-nowrap sm:shrink-0 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => setDetailBookingId(b.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canHold && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 px-3 flex-1 sm:flex-none"
                            onClick={() => handleHold(b.id)}
                            disabled={transition.isPending}
                          >
                            <HandMetal className="h-3.5 w-3.5 mr-1" /> {t("inquiry.hold")}
                          </Button>
                        )}
                        {canDismiss && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-3 flex-1 sm:flex-none"
                            onClick={() => setDismissId(b.id)}
                            disabled={transition.isPending}
                          >
                            <X className="h-3.5 w-3.5 mr-1" /> {t("inquiry.dismiss")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booking detail sheet for viewing inquiry details */}
      <BookingDetailSheet
        bookingId={detailBookingId}
        open={!!detailBookingId}
        onOpenChange={(open) => !open && setDetailBookingId(null)}
        isAdmin={isAdmin}
      />

      <Dialog open={!!dismissId} onOpenChange={(o) => !o && setDismissId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inquiry.dismissTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t("inquiry.reasonPlaceholder")}
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDismissId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!dismissReason.trim() || transition.isPending}
              onClick={handleDismiss}
            >
              {t("inquiry.confirmDismiss")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
