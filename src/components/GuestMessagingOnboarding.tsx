// First-visit messaging onboarding — shown once per guest at the top of the
// guest portal until they've linked at least one messaging channel (or skipped).
// Mints a one-time link code via the messaging-link edge function and deep-links
// the guest into Telegram/WhatsApp with /link <code> pre-filled. Polls
// messaging_chat_bindings every 3s and auto-advances when a binding appears.

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, MessageCircle, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SKIP_KEY_PREFIX = "gs_msg_onboard_skipped_";
const POLL_INTERVAL_MS = 3000;

interface BotConfig {
  telegram_bot_username?: string;
  whatsapp_number?: string;
}

export function GuestMessagingOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [hasBinding, setHasBinding] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [botConfig, setBotConfig] = useState<BotConfig>({});
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingChannel, setGeneratingChannel] = useState<"telegram" | "whatsapp" | null>(null);
  const [waitingForLink, setWaitingForLink] = useState(false);

  // Initial load: existing binding check, skip flag, bot config
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      // Skip flag (per-user)
      const skipFlag = localStorage.getItem(SKIP_KEY_PREFIX + user.id);
      if (skipFlag) {
        if (!cancelled) {
          setSkipped(true);
          setLoading(false);
        }
        return;
      }

      // Check for any confirmed binding for this user
      const { data: bindings } = await supabase
        .from("messaging_chat_bindings")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (cancelled) return;

      if (bindings && bindings.length > 0) {
        setHasBinding(true);
        setLoading(false);
        return;
      }

      // Load bot config from policy_settings (public read on policy_settings is allowed)
      const { data: policy } = await supabase
        .from("policy_settings")
        .select("value")
        .eq("key", "messaging_bot_config")
        .maybeSingle();

      if (!cancelled) {
        const cfg = (policy?.value as BotConfig | null) ?? {};
        setBotConfig(cfg);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Poll for binding while waiting for the user to confirm in their messaging app
  useEffect(() => {
    if (!waitingForLink || !user) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("messaging_chat_bindings")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (data && data.length > 0) {
        setHasBinding(true);
        setWaitingForLink(false);
        toast({
          title: "Connected!",
          description: "You'll get instant stay updates from now on.",
        });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [waitingForLink, user, toast]);

  const generateCode = useCallback(async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/messaging-link`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate code");
      }
      const data = await resp.json();
      return data.code as string;
    } catch (err: any) {
      toast({
        title: "Couldn't start link",
        description: err.message ?? "Please try again.",
        variant: "destructive",
      });
      return null;
    }
  }, [toast]);

  const handleConnect = async (channel: "telegram" | "whatsapp") => {
    setGeneratingChannel(channel);
    const code = linkCode ?? (await generateCode());
    setGeneratingChannel(null);
    if (!code) return;
    setLinkCode(code);

    if (channel === "telegram") {
      const username = botConfig.telegram_bot_username?.replace(/^@/, "");
      if (!username) {
        toast({
          title: "Telegram not set up yet",
          description: "Ask staff to configure the Telegram bot.",
          variant: "destructive",
        });
        return;
      }
      // Try native deep link first, fall back to web in a new tab
      const webUrl = `https://t.me/${username}?start=link_${code}`;
      window.open(webUrl, "_blank", "noopener,noreferrer");
      setWaitingForLink(true);
    } else {
      const number = botConfig.whatsapp_number?.replace(/\D/g, "");
      if (!number) {
        toast({
          title: "WhatsApp not set up yet",
          description: "Ask staff to configure the WhatsApp number.",
          variant: "destructive",
        });
        return;
      }
      const text = encodeURIComponent(`/link ${code}`);
      const waUrl = `https://wa.me/${number}?text=${text}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      setWaitingForLink(true);
    }
  };

  const handleSkip = () => {
    if (user) localStorage.setItem(SKIP_KEY_PREFIX + user.id, Date.now().toString());
    setSkipped(true);
  };

  const handleManualContinue = () => {
    setWaitingForLink(false);
    handleSkip();
  };

  // Hidden states
  if (!user || loading) {
    return loading && user ? (
      <Skeleton className="h-32 w-full rounded-xl" />
    ) : null;
  }
  if (hasBinding || skipped) return null;

  // Channel availability
  const telegramAvailable = !!botConfig.telegram_bot_username;
  const whatsappAvailable = !!botConfig.whatsapp_number;
  if (!telegramAvailable && !whatsappAvailable) return null; // nothing to offer

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent animate-fade-up">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              Stay connected during your visit
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Get instant updates on arrival, your room, and anything you need.
              Connect in 10 seconds.
            </p>
          </div>
        </div>

        {waitingForLink ? (
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Waiting for you to send the message…
            </div>
            <p className="text-xs text-muted-foreground">
              Send <code className="px-1.5 py-0.5 rounded bg-background font-mono">/link {linkCode}</code> in
              the app that just opened. We'll auto-detect once you're connected.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={handleManualContinue}>
                Continue to portal
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {telegramAvailable && (
              <Button
                onClick={() => handleConnect("telegram")}
                disabled={generatingChannel !== null}
                className="w-full"
                size="lg"
              >
                <Send className="h-4 w-4 mr-2" />
                {generatingChannel === "telegram" ? "Opening…" : "Connect via Telegram"}
              </Button>
            )}
            {whatsappAvailable && (
              <Button
                onClick={() => handleConnect("whatsapp")}
                disabled={generatingChannel !== null}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                {generatingChannel === "whatsapp" ? "Opening…" : "Connect via WhatsApp"}
              </Button>
            )}
          </div>
        )}

        {!waitingForLink && (
          <div className="text-center">
            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
