import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Send, CheckCircle2, AlertTriangle, Mail } from "lucide-react";

interface Result {
  sent: boolean;
  from?: string;
  to?: string;
  message_id?: string | null;
  error?: string;
  status?: number;
  note?: string;
}

/**
 * Admin-only. Sends a real test email to the current contact_email (or an
 * override) via Resend so we can verify the address actually receives mail.
 * Used to catch mailbox / forwarding failures like Nikki's 554 bounce.
 */
export function SendTestEmailButton() {
  const { role } = useAuth();
  const [override, setOverride] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const { toast } = useToast();

  if (role !== "admin") return null;

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-contact-email", {
        body: override.trim() ? { to: override.trim() } : {},
      });
      if (error) {
        let details = error.message;
        try {
          // @ts-ignore FunctionsHttpError.context
          const ctx = (error as any).context;
          if (ctx?.text) details = await ctx.text();
        } catch { /* ignore */ }
        try {
          const parsed = JSON.parse(details);
          setResult({ sent: false, ...parsed });
        } catch {
          setResult({ sent: false, error: details });
        }
        toast({
          title: "Test email failed",
          description: (details || "").slice(0, 240),
          variant: "destructive",
        });
        return;
      }
      setResult(data as Result);
      if ((data as Result)?.sent) {
        toast({
          title: "Test email dispatched",
          description: `Queued for ${(data as Result).to}. Check the inbox (and spam) to confirm arrival.`,
        });
      } else {
        toast({
          title: "Not sent",
          description: (data as Result)?.error || "Provider did not accept the message.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      const msg = e?.message || "Unknown error";
      setResult({ sent: false, error: msg });
      toast({ title: "Test email failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Send Test Email
        </CardTitle>
        <CardDescription className="text-xs mt-1">
          Sends a short real message to the saved <strong>Contact Email</strong> via
          the built-in LMT CampStay email engine. Use this to verify the inbox /
          forwarding is actually working. No booking, guest, or payment data is touched.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Override recipient (optional) — leave blank to test the saved contact email
          </Label>
          <div className="flex gap-2 flex-wrap">
            <Input
              type="email"
              placeholder="you@example.com"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              className="h-9 text-sm max-w-[280px]"
            />
            <Button onClick={run} disabled={loading} size="sm" className="gap-1.5 h-9">
              <Send className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`} />
              {loading ? "Sending…" : "Send test email"}
            </Button>
          </div>
        </div>

        {result && (
          <div
            className={`rounded-lg border p-3 text-xs space-y-1 ${
              result.sent
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            }`}
          >
            <div className="flex items-center gap-1.5 font-medium">
              {result.sent ? (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Queued for delivery</>
              ) : (
                <><AlertTriangle className="h-3.5 w-3.5" /> Not sent</>
              )}
            </div>
            {result.from && <div><span className="opacity-70">From:</span> {result.from}</div>}
            {result.to && <div><span className="opacity-70">To:</span> {result.to}</div>}
            {result.message_id && (
              <div><span className="opacity-70">Message id:</span> <code className="font-mono">{result.message_id}</code></div>
            )}
            {result.error && (
              <div className="whitespace-pre-wrap break-words">
                <span className="opacity-70">Error:</span> {result.error}
              </div>
            )}
            {result.note && <div className="opacity-80">{result.note}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
