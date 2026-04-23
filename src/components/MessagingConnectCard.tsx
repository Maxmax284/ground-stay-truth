// MessagingConnectCard — guest-facing card to link WhatsApp/Telegram
// to a Lovable account. One-tap: clicks the channel button, we mint a code,
// then open the bot's deep link in a new tab. The bot auto-handles
// `/start link_<code>` (Telegram) or `/link <code>` (WhatsApp) and links
// the account — no copy/paste.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
import { useBotIdentity, buildConnectUrl } from "@/hooks/useBotIdentity";

export function MessagingConnectCard() {
  const { toast } = useToast();
  const { data: identity, isLoading } = useBotIdentity();
  const [busy, setBusy] = useState<"telegram" | "whatsapp" | null>(null);

  const connect = async (channel: "telegram" | "whatsapp") => {
    if (!identity) return;
    setBusy(channel);
    try {
      const url = await buildConnectUrl(channel, identity);
      window.open(url, "_blank", "noopener,noreferrer");
      toast({
        title: "Opening " + (channel === "telegram" ? "Telegram" : "WhatsApp"),
        description: "Tap Start in the chat to finish connecting.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't open chat", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const tgReady = identity?.telegram.configured && !!identity.telegram.username;
  const waReady = identity?.whatsapp.configured && !!identity.whatsapp.number;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Connect WhatsApp / Telegram</CardTitle>
            <CardDescription>One tap to get stay updates and chat with us in your favorite app.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => connect("telegram")}
            disabled={!tgReady || busy !== null || isLoading}
            size="sm"
          >
            {busy === "telegram"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Send className="h-4 w-4 mr-2" />}
            Connect Telegram
          </Button>
          <Button
            onClick={() => connect("whatsapp")}
            disabled={!waReady || busy !== null || isLoading}
            size="sm"
            variant="outline"
          >
            {busy === "whatsapp"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <MessageCircle className="h-4 w-4 mr-2" />}
            Connect WhatsApp
          </Button>
        </div>
        {!tgReady && !waReady && !isLoading && (
          <p className="text-xs text-muted-foreground">
            Messaging channels aren't set up yet. Check back soon.
          </p>
        )}
        <Separator />
        <NotificationPreferencesPanel />
      </CardContent>
    </Card>
  );
}
