import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateMessage } from "@/hooks/useBookings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { playGroundSound } from "@/lib/groundSounds";

/**
 * "I've landed / I'm here" — a plain guest message on the booking thread.
 * It only tells staff (via the normal message alerts + email). It never
 * changes the booking, pickup, room or check-in state. Guests with an active
 * airport pickup already get the landing confirmation on their pickup card,
 * so this only shows for guests without one.
 */
type Kind = "landed" | "here";

function bangkokDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
}

export function GuestArrivedSignal({ booking }: { booking: { id: string; check_in: string } }) {
  const { t } = useTranslation();
  const createMessage = useCreateMessage();
  const storeKey = (k: Kind) => `arrived-signal:${booking.id}:${k}`;
  const [sent, setSent] = useState<Record<Kind, boolean>>(() => ({
    landed: !!localStorage.getItem(storeKey("landed")),
    here: !!localStorage.getItem(storeKey("here")),
  }));

  const { data: hasPickup } = useQuery({
    queryKey: ["arrived-signal-pickup", booking.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("airport_pickups")
        .select("id, status")
        .eq("booking_id", booking.id)
        .in("status", ["requested", "assigned", "confirmed"])
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
  });

  // Only around arrival day (day before → two days after, Bangkok time).
  const today = bangkokDay(new Date());
  const ci = booking.check_in?.slice(0, 10);
  if (!ci) return null;
  const dayMs = 86_400_000;
  const diff = (Date.parse(today) - Date.parse(ci)) / dayMs;
  if (diff < -1 || diff > 2 || hasPickup !== false) return null;

  const send = async (kind: Kind) => {
    const content = kind === "landed"
      ? t("arrivedSignal.landedMsg", "✈️ I've landed and I'm on my way to the camp.")
      : t("arrivedSignal.hereMsg", "📍 I'm here at the camp.");
    try {
      await createMessage.mutateAsync({ booking_id: booking.id, content, is_internal: false });
      localStorage.setItem(storeKey(kind), "1");
      setSent((s) => ({ ...s, [kind]: true }));
      playGroundSound(kind === "landed" ? "landed" : "check_in", 0.35);
      toast.success(t("arrivedSignal.sent", "Front desk notified"));
    } catch (e: any) {
      toast.error(e?.message || t("messages.messageFailed"));
    }
  };

  const Btn = ({ kind, icon: Icon, label }: { kind: Kind; icon: typeof Plane; label: string }) => (
    <Button
      variant={sent[kind] ? "outline" : "default"}
      className="flex-1"
      disabled={sent[kind] || createMessage.isPending}
      onClick={() => send(kind)}
    >
      {createMessage.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        : sent[kind] ? <CheckCircle2 className="h-4 w-4 mr-1.5" />
        : <Icon className="h-4 w-4 mr-1.5" />}
      {label}
    </Button>
  );

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("arrivedSignal.title", "Arriving today?")}</p>
          <p className="text-xs text-muted-foreground">
            {t("arrivedSignal.body", "One tap lets the front desk know. It just sends them a message — nothing else changes.")}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Btn kind="landed" icon={Plane} label={sent.landed ? t("arrivedSignal.landedDone", "Landed — sent") : t("arrivedSignal.landed", "I've landed")} />
          <Btn kind="here" icon={MapPin} label={sent.here ? t("arrivedSignal.hereDone", "Here — sent") : t("arrivedSignal.here", "I'm here")} />
        </div>
      </CardContent>
    </Card>
  );
}
