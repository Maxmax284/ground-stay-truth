import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ExternalLink, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-webhook`;

const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
];

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast({ title: "Copied", description: label });
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-md border bg-muted/40 p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className={`flex-1 text-xs break-all ${mono ? "font-mono" : ""}`}>{value}</code>
        <Button size="sm" variant="ghost" onClick={copy} className="h-7 px-2 gap-1">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export function StripeWebhookWizard() {
  const allEvents = REQUIRED_EVENTS.join("\n");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-muted-foreground" />
          Stripe Webhook Setup Wizard
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Point Stripe at LMT CampStay so real payments confirm automatically. Takes ~2 minutes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5">1</Badge>
            <span className="text-sm font-medium">Open the Stripe webhook page</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Make sure the top-right toggle says <b>Live mode</b> (not Test).
          </p>
          <Button size="sm" variant="outline" asChild className="gap-1">
            <a
              href="https://dashboard.stripe.com/webhooks/create"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Stripe → Add endpoint <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5">2</Badge>
            <span className="text-sm font-medium">Paste this as the Endpoint URL</span>
          </div>
          <CopyRow label="Endpoint URL" value={WEBHOOK_URL} />
        </div>

        {/* Step 3 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5">3</Badge>
            <span className="text-sm font-medium">Select these events</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Click "Select events" in Stripe, search each one, tick it. Or paste the full list below.
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {REQUIRED_EVENTS.map((ev) => (
              <div
                key={ev}
                className="flex items-center justify-between rounded-md border bg-muted/40 px-2.5 py-1.5"
              >
                <code className="text-xs font-mono">{ev}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => {
                    navigator.clipboard.writeText(ev);
                    toast({ title: "Copied", description: ev });
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              navigator.clipboard.writeText(allEvents);
              toast({ title: "All 6 events copied", description: "Paste into Stripe" });
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy all 6
          </Button>
        </div>

        {/* Step 4 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5">4</Badge>
            <span className="text-sm font-medium">Copy the signing secret</span>
          </div>
          <p className="text-xs text-muted-foreground">
            After "Add endpoint", Stripe shows a <b>Signing secret</b> starting with <code className="font-mono">whsec_</code>.
            Click <b>Reveal</b>, copy it.
          </p>
        </div>

        {/* Step 5 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5">5</Badge>
            <span className="text-sm font-medium">Paste it into Integrations</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Settings → Integrations → Stripe → <b>Webhook Signing Secret</b> → paste → Save.
            This overwrites the old one, which is required.
          </p>
        </div>

        {/* Step 6 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5">6</Badge>
            <span className="text-sm font-medium">Fire a test event to prove it works</span>
          </div>
          <p className="text-xs text-muted-foreground">
            In Stripe, open your new endpoint → <b>Send test webhook</b> →
            pick <code className="font-mono">checkout.session.completed</code> → Send.
            Then refresh the Stripe Diagnostics card above — it should flip to <b>GO</b> and unlock the Generate Link buttons.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
