// CampCommunicationCard — the guest's one obvious way to reach the camp.
//
// Replaces the old code-based messaging onboarding (generate a 6-digit code,
// text "/link 123456" to a bot). Nobody landing after 20 hours of flights types
// a PIN into a chat window. This card says what it does in one line, offers the
// portal chat first (always works), and WhatsApp second when the camp's number
// is live.
//
// It shows what channel a guest has, never promises one that isn't set up, and
// never claims a reply time. Operational truth first: it sits under the "next
// step" cards, not above them.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, MessagesSquare, ShieldCheck } from "lucide-react";
import { GuestThreadDialog } from "@/components/GuestThreadDialog";
import { useBotIdentity } from "@/hooks/useBotIdentity";

export interface CampCommunicationCardProps {
  /** The stay this conversation belongs to. Null hides the portal chat. */
  bookingId: string | null;
  guestName?: string | null;
  /** Booking reference shown in the WhatsApp greeting so staff know who wrote. */
  bookingReference?: string | null;
}

export function CampCommunicationCard({
  bookingId,
  guestName,
  bookingReference,
}: CampCommunicationCardProps) {
  const { t } = useTranslation();
  const [chatOpen, setChatOpen] = useState(false);
  const { data: identity } = useBotIdentity();

  const whatsappNumber = identity?.whatsapp.configured ? identity.whatsapp.number : null;

  const whatsappUrl = useMemo(() => {
    if (!whatsappNumber) return null;
    const digits = whatsappNumber.replace(/\D/g, "");
    const who = guestName?.split(" ")[0] ?? "";
    const ref = bookingReference ? ` (${bookingReference})` : "";
    const greeting = t("guestComms.whatsappGreeting", {
      defaultValue: "Hi Lamai Camp, this is {{name}}{{ref}} —",
      name: who || t("guestComms.aGuest", "a guest"),
      ref,
    });
    return `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
  }, [whatsappNumber, guestName, bookingReference, t]);

  if (!bookingId) return null;

  return (
    <>
      <Card className="camp-pass min-w-0 max-w-full overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessagesSquare className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t("guestComms.title", "Talk to the camp")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {t(
                  "guestComms.body",
                  "Arrival, your room, training, anything at all — write here and the front desk sees it on your booking.",
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button size="lg" className="w-full" onClick={() => setChatOpen(true)}>
              <MessagesSquare className="h-4 w-4 mr-2" aria-hidden />
              {t("guestComms.openChat", "Message the front desk")}
            </Button>

            {whatsappUrl && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full"
              >
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" aria-hidden />
                  {t("guestComms.openWhatsapp", "Use WhatsApp instead")}
                </a>
              </Button>
            )}
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden />
            {t(
              "guestComms.saved",
              "Every message is saved to your stay, so whoever is on shift already knows your story.",
            )}
          </p>
        </CardContent>
      </Card>

      <GuestThreadDialog
        bookingId={chatOpen ? bookingId : null}
        open={chatOpen}
        onOpenChange={setChatOpen}
        headline={t("guestComms.threadTitle", "Lamai front desk")}
        guestName={guestName}
      />
    </>
  );
}

export default CampCommunicationCard;
