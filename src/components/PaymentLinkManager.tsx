import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link as LinkIcon, Copy, RefreshCw, Check, Clock, Mail, Bell } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface PaymentLinkManagerProps {
  bookingId: string;
}

interface LinkRow {
  id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  amount: number;
  currency: string;
}

type CollectKind = "deposit" | "balance" | "full" | "security_deposit";

async function callCreate(bookingId: string, regenerate: boolean, collect: CollectKind) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-link`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ booking_id: bookingId, regenerate, collect }),
    },
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Failed");
  return data as {
    url: string;
    expires_at: string;
    payment_link_id: string;
    amount: number;
    currency: string;
    label?: string;
    email_sent?: boolean;
    notification_created?: boolean;
  };
}

const COLLECT_LABELS: Record<CollectKind, string> = {
  deposit: "Collect Deposit (default)",
  balance: "Collect Remaining Balance",
  full: "Collect Full Payment",
  security_deposit: "Collect Security Deposit",
};

export function PaymentLinkManager({ bookingId }: PaymentLinkManagerProps) {
  const qc = useQueryClient();
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof callCreate>> | null>(null);
  const [copied, setCopied] = useState(false);
  const [collect, setCollect] = useState<CollectKind>("deposit");

  const { data: links, isLoading } = useQuery({
    queryKey: ["payment-links", bookingId],
    queryFn: async (): Promise<LinkRow[]> => {
      const { data, error } = await supabase
        .from("payment_links")
        .select("id, created_at, expires_at, used_at, revoked_at, amount, currency")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as LinkRow[];
    },
  });

  const createMut = useMutation({
    mutationFn: (regenerate: boolean) => callCreate(bookingId, regenerate, collect),
    onSuccess: async (data) => {
      setLastUrl(data.url);
      setLastResult(data);
      qc.invalidateQueries({ queryKey: ["payment-links", bookingId] });
      const bits: string[] = [];
      if (data.email_sent) bits.push("emailed");
      if (data.notification_created) bits.push("portal notified");
      toast.success(
        bits.length
          ? `Link sent to guest (${bits.join(" + ")})`
          : "Link ready — guest had no email, copy and send manually",
      );

      // Audit-only timeline entry on the booking conversation (internal note, no guest visibility, no URL)
      try {
        const { data: userData } = await supabase.auth.getUser();
        const channels: string[] = [];
        if (data.email_sent) channels.push("email");
        if (data.notification_created) channels.push("guest portal");
        const channelText = channels.length ? channels.join(" and ") : "no automatic channel (manual delivery)";
        const label = data.label || COLLECT_LABELS[collect];
        const amountText = `${data.currency.toUpperCase()} ${Number(data.amount).toLocaleString()}`;
        const verb = collect === "deposit" ? "Payment request" : `${label}`;
        await supabase.from("messages").insert({
          booking_id: bookingId,
          sender_id: userData.user?.id ?? null,
          content: `🧾 ${verb} (${amountText}) created and delivered via ${channelText}.`,
          is_internal: true,
          draft: false,
        });
        qc.invalidateQueries({ queryKey: ["messages", bookingId] });
        qc.invalidateQueries({ queryKey: ["booking-messages", bookingId] });
      } catch { /* timeline entry is best-effort */ }
    },
    onError: (err: any) => toast.error(err.message || "Failed to create link"),
  });

  const handleCopy = async () => {
    if (!lastUrl) return;
    await navigator.clipboard.writeText(lastUrl);
    setCopied(true);
    toast.success("Link copied");
    try {
      const links = await supabase.from("payment_links")
        .select("id").eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(1);
      const linkId = links.data?.[0]?.id;
      if (linkId) {
        await supabase.from("payment_link_events").insert({
          payment_link_id: linkId,
          booking_id: bookingId,
          event_type: "copied",
          actor_id: (await supabase.auth.getUser()).data.user?.id,
          actor_role: "staff",
          context: {},
        });
      }
    } catch { /* swallow */ }
    setTimeout(() => setCopied(false), 2000);
  };

  const active = links?.find((l) => !l.used_at && !l.revoked_at && new Date(l.expires_at).getTime() > Date.now());

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <LinkIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Guest Payment Link</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Generates a secure Stripe link, emails it to the guest, and pings their portal.
        WhatsApp / LINE stay manual — copy + send if you want to use those.
      </p>

      <div className="space-y-1">
        <Label className="text-xs">What to collect</Label>
        <Select value={collect} onValueChange={(v) => setCollect(v as CollectKind)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.entries(COLLECT_LABELS) as [CollectKind, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {lastUrl && lastResult && (
        <div className="rounded-md border border-border bg-muted/40 p-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge variant="outline">{lastResult.label || "Payment"}</Badge>
            <span className="font-medium">{lastResult.currency.toUpperCase()} {Number(lastResult.amount).toLocaleString()}</span>
            {lastResult.email_sent && (
              <Badge className="bg-success/15 text-[hsl(var(--success))] border-0 gap-1">
                <Mail className="h-3 w-3" /> Emailed
              </Badge>
            )}
            {lastResult.notification_created && (
              <Badge className="bg-info/15 text-[hsl(var(--info))] border-0 gap-1">
                <Bell className="h-3 w-3" /> In portal
              </Badge>
            )}
          </div>
          <div className="text-xs break-all text-foreground font-mono">{lastUrl}</div>
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-2">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy for WhatsApp / LINE"}
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        {!active && (
          <Button size="sm" onClick={() => createMut.mutate(false)} disabled={createMut.isPending} className="gap-2">
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
            Generate &amp; Send Link
          </Button>
        )}
        {active && (
          <Button size="sm" variant="outline" onClick={() => createMut.mutate(true)} disabled={createMut.isPending} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate &amp; Resend
          </Button>
        )}
      </div>

      {isLoading ? null : links && links.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">Recent links</p>
          {links.map((l) => {
            const expired = new Date(l.expires_at).getTime() < Date.now();
            const state = l.revoked_at ? "revoked"
              : l.used_at ? "used"
              : expired ? "expired" : "active";
            return (
              <div key={l.id} className="flex items-center justify-between text-xs gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {state === "active"
                    ? `expires ${formatDistanceToNow(new Date(l.expires_at), { addSuffix: true })}`
                    : state}
                </span>
                <span className="text-muted-foreground">{l.currency.toUpperCase()} {Number(l.amount).toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
