// MessagingConnectCard — guest-facing card to link WhatsApp/Telegram/SMS
// to a Lovable account. Lives on /stay (GuestPortal) so guests don't need
// access to the Settings page. Generates a one-time 6-digit link code via
// the messaging-link edge function, then walks the user through sending it
// to the bot.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Send, Copy, RefreshCw, MessageCircle } from "lucide-react";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";

export function MessagingConnectCard() {
  const { toast } = useToast();
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const generate = async () => {
    setGeneratingCode(true);
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
      setLinkCode(data.code);
      toast({ title: "Code ready", description: `Send "/link ${data.code}" to your bot. Expires in 15 min.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingCode(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Connect WhatsApp / Telegram / SMS</CardTitle>
            <CardDescription>Get stay updates and chat with us right from your messaging app.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={generate} disabled={generatingCode} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${generatingCode ? "animate-spin" : ""}`} />
            {linkCode ? "Generate new code" : "Generate code"}
          </Button>
          {linkCode && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted font-mono text-lg tracking-widest">
              {linkCode}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(`/link ${linkCode}`)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {linkCode ? (
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Next steps:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Open the bot we set up on your preferred channel.</li>
              <li>Send: <code className="px-1.5 py-0.5 rounded bg-background">/link {linkCode}</code></li>
              <li>You'll get a confirmation reply. After that, just chat normally.</li>
            </ol>
            <p className="pt-1.5"><Badge variant="outline" className="text-[10px]">15 min</Badge> code expires after 15 minutes.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Generate a one-time 6-digit code, then send it to our bot on Telegram, WhatsApp, or SMS to link your account.
          </p>
        )}
        <Separator />
        <NotificationPreferencesPanel />
      </CardContent>
    </Card>
  );
}
