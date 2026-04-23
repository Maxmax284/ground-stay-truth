// GuestPersonalGuideCard — prominent "personal guide" hero shown near the top
// of the guest portal once a booking is confirmed/active. Frames Telegram +
// WhatsApp as a featured perk (text Kru Glitch directly) rather than a settings
// option. Shows live connection state per channel, with WhatsApp gracefully
// gated to "Coming soon" if the bridge isn't configured yet.
//
// Uses the same one-tap connect flow as MessagingConnectCard via useBotIdentity.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Send, MessageCircle, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBotIdentity, buildConnectUrl } from "@/hooks/useBotIdentity";

interface GuestPersonalGuideCardProps {
  /** Optional contextual lead-in for the booking-confirmation surface. */
  variant?: "portal" | "confirmation" | "pre_arrival";
}

export function GuestPersonalGuideCard({ variant = "portal" }: GuestPersonalGuideCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: identity, isLoading: identityLoading } = useBotIdentity();
  const [busy, setBusy] = useState<"telegram" | "whatsapp" | null>(null);

  // Live connection state — which channels has this guest already linked?
  const { data: bindings, isLoading: bindingsLoading } = useQuery({
    queryKey: ["personal-guide-bindings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messaging_chat_bindings")
        .select("channel")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000, // catch the moment a new link lands
  });

  const tgConnected = (bindings ?? []).some((b) => b.channel === "telegram");
  const waConnected = (bindings ?? []).some((b) => b.channel === "whatsapp");
  const tgReady = identity?.telegram.configured && !!identity.telegram.username;
  const waReady = identity?.whatsapp.configured && !!identity.whatsapp.number;
  const anyConnected = tgConnected || waConnected;

  const connect = async (channel: "telegram" | "whatsapp") => {
    if (!identity) return;
    setBusy(channel);
    try {
      const url = await buildConnectUrl(channel, identity);
      window.open(url, "_blank", "noopener,noreferrer");
      toast({
        title: `Opening ${channel === "telegram" ? "Telegram" : "WhatsApp"}`,
        description: "Tap Start in the chat to finish connecting.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't open chat", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // Variant-specific copy
  const copy = (() => {
    switch (variant) {
      case "confirmation":
        return {
          title: "Add your personal guide",
          subtitle:
            "Now that you're booked, connect Kru Glitch on the app you already use. Local tips, arrival help, and questions answered in seconds — no need to log in.",
        };
      case "pre_arrival":
        return {
          title: "Your personal guide for arrival",
          subtitle:
            "Text Kru Glitch directly for last-minute arrival help — ferry timing, BKK transit, what to expect at the pier. Most guests connect before the trip.",
        };
      default:
        return {
          title: "Your personal guide",
          subtitle:
            "Text Kru Glitch directly on the app you already use. Local tips, arrival help, questions about the island, anything during your stay — no need to open the portal every time.",
        };
    }
  })();

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
                {copy.title}
              </h2>
              {!anyConnected && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  Recommended
                </Badge>
              )}
              {anyConnected && (
                <Badge className="text-[10px] uppercase tracking-wide bg-success/15 text-success border border-success/30 hover:bg-success/15">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {copy.subtitle}
            </p>
            {!anyConnected && (
              <p className="text-xs text-muted-foreground/80 italic">
                Most guests connect before arrival.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Telegram */}
          {tgConnected ? (
            <Button variant="outline" size="lg" className="w-full justify-start" disabled>
              <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
              Telegram connected
            </Button>
          ) : (
            <Button
              onClick={() => connect("telegram")}
              disabled={!tgReady || busy !== null || identityLoading || bindingsLoading}
              size="lg"
              className="w-full"
            >
              {busy === "telegram" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {tgReady ? "Connect Telegram" : "Telegram coming soon"}
            </Button>
          )}

          {/* WhatsApp */}
          {waConnected ? (
            <Button variant="outline" size="lg" className="w-full justify-start" disabled>
              <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
              WhatsApp connected
            </Button>
          ) : (
            <Button
              onClick={() => connect("whatsapp")}
              disabled={!waReady || busy !== null || identityLoading || bindingsLoading}
              size="lg"
              variant="outline"
              className="w-full"
            >
              {busy === "whatsapp" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4 mr-2" />
              )}
              {waReady ? "Connect WhatsApp" : "WhatsApp coming soon"}
            </Button>
          )}
        </div>

        {!tgReady && !waReady && !identityLoading && (
          <p className="text-xs text-muted-foreground">
            Messaging channels are being set up — check back soon.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
