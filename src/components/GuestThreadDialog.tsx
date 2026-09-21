import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Loader2, Send, User, Lock, MessagesSquare, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useBookingMessages, useCreateMessage } from "@/hooks/useBookings";
import { permissions } from "@/lib/permissions";

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
  const { t } = useTranslation();
  const { role, user, isAdmin } = useAuth();
  const { data: messages, isLoading } = useBookingMessages(open ? bookingId : null);
  const createMessage = useCreateMessage();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const canReply = permissions.canSendMessages(role);

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
        is_internal: isInternal,
      });
      setContent("");
      if (!isInternal && !isAdmin) {
        toast.success(t("messages.draftQueued"), { description: t("messages.draftQueuedDesc") });
      } else {
        toast.success(t("messages.messageSent"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("messages.messageFailed"));
    }
  };

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
                    <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                    <div className="flex items-center gap-2 text-[10px] opacity-80">
                      {m.is_internal && (
                        <span className="inline-flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" />
                          {t("messages.internal")}
                        </span>
                      )}
                      <span>{format(new Date(m.created_at), "MMM d, h:mm a")}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t px-4 py-3 space-y-2">
          {canReply ? (
            <>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={isInternal ? t("messages.writeNote") : t("messages.replyPlaceholder")}
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
                <div className="flex items-center gap-2">
                  <Switch id="thread-internal" checked={isInternal} onCheckedChange={setIsInternal} />
                  <Label htmlFor="thread-internal" className="text-xs text-muted-foreground">
                    {isInternal ? t("messages.internalNote") : t("messages.guestVisible")}
                  </Label>
                </div>
                <Button size="sm" onClick={handleSend} disabled={!content.trim() || createMessage.isPending}>
                  {createMessage.isPending
                    ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    : <Send className="h-3.5 w-3.5 mr-1" />}
                  {t("messages.send")}
                </Button>
              </div>
              {!isInternal && (
                <Badge variant="outline" className="text-[10px]">{t("messages.guestWillSee")}</Badge>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t("messages.readOnly")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GuestThreadDialog;
