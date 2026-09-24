import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TranslatableText } from "@/components/TranslatableText";
import { format } from "date-fns";
import { Loader2, Send, User, Lock, MessagesSquare, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useBookingMessages, useCreateMessage } from "@/hooks/useBookings";
import { permissions } from "@/lib/permissions";
import { useAirportPickup } from "@/hooks/useAirportPickups";
import { PickupConversation } from "@/components/PickupConversation";
import { MessageSourceBadge } from "@/components/MessageSourceBadge";

interface GuestThreadDialogProps {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headline?: string;
  guestName?: string | null;
  onOpenBooking?: () => void;
}

/**
 * Direct reply surface for a single guest conversation. Staff (front desk and
 * above) can answer the guest without digging through the booking sheet.
 * Managers/admins get the same view — the guest-visible toggle decides whether
 * the guest sees the reply. Read-only roles see the transcript only.
 */
export function GuestThreadDialog({
  bookingId,
  open,
  onOpenChange,
  headline,
  guestName,
  onOpenBooking,
}: GuestThreadDialogProps) {
  const { t, i18n } = useTranslation();
  // Each reader gets the thread in their own chosen display language.
  const readerLanguage = (i18n.language || "en").split("-")[0];
  const { role, user, isAdmin } = useAuth();
  const { data: messages, isLoading } = useBookingMessages(open ? bookingId : null);
  const createMessage = useCreateMessage();
  const { data: pickup } = useAirportPickup(open ? bookingId : null);
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Guests write from the portal's "Talk to the camp" card; RLS already
  // restricts them to their own bookings with is_internal = false.
  const isGuest = role === "guest";
  const canReply = isGuest || permissions.canSendMessages(role);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages?.length]);

  useEffect(() => {
    if (!open) {
      setContent("");
      setIsInternal(false);
    }
  }, [open]);

  const handleSend = async () => {
    const body = content.trim();
    if (!body || !bookingId) return;
    try {
      await createMessage.mutateAsync({
        booking_id: bookingId,
        content: body,
        is_internal: isGuest ? false : isInternal,
      });
      setContent("");
      if (!isInternal && !isAdmin) {
        toast.success(t("messages.messageSent"), { description: t(isGuest ? "messages.campNotified" : "messages.adminNotified") });
      } else {
        toast.success(t("messages.messageSent"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("messages.messageFailed"));
    }
  };

  // Driver pickup chat is a staff surface — guests use the pickup card.
  const showPickupTab = Boolean(pickup) && !isGuest;

  const transcript = (
    <div className="max-h-[45vh] overflow-y-auto px-4 py-3 space-y-3">
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : (messages ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t("messages.noMessages")}</p>
      ) : (
        (messages ?? []).map((m: any) => {
          const mine = m.sender_id && m.sender_id === user?.id;
          // A reply from a registered camp number is staff, not an unknown guest.
          const sender = m.sender_id ? senderLabels?.[m.sender_id] : undefined;
          const fromStaff = !!sender?.is_staff;
          const senderName = fromStaff
            ? [sender?.display_name || t("messages.staffLabel"), sender?.staff_label]
                .filter(Boolean)
                .join(" · ")
            : guestName || t("messages.guestLabel");
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 space-y-1 ${
                  m.is_internal
                    ? "bg-muted text-foreground border border-dashed"
                    : mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-accent-foreground"
                }`}
              >
                {mine ? (
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                ) : (
                  <TranslatableText
                    messageId={m.id}
                    text={m.content}
                    targetLanguage={readerLanguage}
                    onTinted={!m.is_internal}
                  />
                )}
                <div className="flex items-center gap-2 text-[10px] opacity-80">
                  {m.is_internal && (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-2.5 w-2.5" />
                      {t("messages.internal")}
                    </span>
                  )}
                  {m.draft && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Clock className="h-2.5 w-2.5" />
                      {t("messages.awaitingApproval")}
                    </span>
                  )}
                  {/* Which app the guest wrote from. One thread, many doors. */}
                  <MessageSourceBadge source={m.source} />
                  <span>{format(new Date(m.created_at), "MMM d, h:mm a")}</span>
                </div>
              </div>
            </div>
          );
        })
      )}
      <div ref={endRef} />
    </div>
  );

  const composer = (
    <div className="border-t px-4 py-3 space-y-2">
      {canReply ? (
        <>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={isGuest ? t("messages.guestComposerPlaceholder") : isInternal ? t("messages.writeNote") : t("messages.replyPlaceholder")}
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            {isGuest ? <span /> : (
              <div className="flex items-center gap-2">
                <Switch id="thread-internal" checked={isInternal} onCheckedChange={setIsInternal} />
                <Label htmlFor="thread-internal" className="text-xs text-muted-foreground">
                  {isInternal ? t("messages.internalNote") : t("messages.guestVisible")}
                </Label>
              </div>
            )}
            <Button size="sm" onClick={handleSend} disabled={!content.trim() || createMessage.isPending}>
              {createMessage.isPending
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <Send className="h-3.5 w-3.5 mr-1" />}
              {t("messages.send")}
            </Button>
          </div>
          {!isInternal && !isGuest && (
            <Badge variant="outline" className="text-[10px]">
              {isAdmin ? t("messages.guestWillSee") : `${t("messages.guestWillSee")} · ${t("messages.adminNotified")}`}
            </Badge>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("messages.readOnly")}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="h-4 w-4 text-primary" />
            {headline || t("messages.title")}
          </DialogTitle>
          <div className="flex items-center justify-between gap-2">
            {guestName ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {guestName}
              </span>
            ) : <span />}
            {onOpenBooking && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onOpenBooking}>
                <ExternalLink className="h-3 w-3" />
                {t("messages.openBooking")}
              </Button>
            )}
          </div>
        </DialogHeader>

        {showPickupTab ? (
          /* One window, two clearly separated conversations — never two composers at once. */
          <Tabs defaultValue="guest" className="w-full">
            <div className="px-4 pt-3">
              <TabsList className="w-full">
                <TabsTrigger value="guest" className="flex-1 text-xs">
                  {t("messages.guestConversation", { defaultValue: "Guest conversation" })}
                </TabsTrigger>
                <TabsTrigger value="pickup" className="flex-1 text-xs">
                  {t("messages.driverPickupChat", { defaultValue: "Driver pickup" })}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="guest" className="mt-0">
              {transcript}
              {composer}
            </TabsContent>
            <TabsContent value="pickup" className="mt-0 px-4 py-3">
              <PickupConversation
                pickupId={pickup!.id}
                viewer="staff"
                placeholder={t("messages.pickupComposerPlaceholder", { defaultValue: "Message the driver and guest…" })}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {transcript}
            {composer}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GuestThreadDialog;
