import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link as LinkIcon, Copy, RefreshCw, Check, Clock, Mail, Bell, MessageCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { copyText } from "@/lib/clipboard";


interface PaymentLinkManagerProps {
  bookingId: string;
}

interface BookingContact {
  check_in: string;
  check_out: string;
  manual_guest_name: string | null;
  manual_guest_email: string | null;
  manual_guest_phone: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
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
  let resp: Response;
  try {
    resp = await fetch(
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
  } catch {
    // Network/CORS failure — browser never got a response
    throw new Error("Payment link service could not be reached. Check your connection or try again in a moment.");
  }
  let data: any = {};
  try { data = await resp.json(); } catch { /* non-JSON */ }
  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Session expired — please sign in again.");
    if (resp.status === 403) throw new Error("Manager or admin access required to send payment links.");
    throw new Error(data.error || `Payment link could not be created (HTTP ${resp.status}).`);
  }
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
  const [waCopied, setWaCopied] = useState(false);

  // Live-safety readiness — mirrors the backend guard so the button reflects
  // reality before staff even try to click it.
  const { data: readiness } = useQuery({
    queryKey: ["stripe-live-safety"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-diagnostics`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      if (!resp.ok) return null;
      return resp.json() as Promise<{ live_safe: boolean; next_action: string; warnings: string[] }>;
    },
    staleTime: 30_000,
  });
  const liveSafe = readiness?.live_safe !== false; // treat unknown as unsafe? No — only block on explicit false
  const blocked = readiness && readiness.live_safe === false;


  const { data: contact } = useQuery({
    queryKey: ["payment-link-contact", bookingId],
    queryFn: async (): Promise<BookingContact | null> => {
      const { data, error } = await supabase
        .from("bookings")
        .select("check_in, check_out, manual_guest_name, manual_guest_email, manual_guest_phone, profiles:profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BookingContact | null;
    },
  });

  const guestEmail = contact?.profiles?.email?.trim() || contact?.manual_guest_email?.trim() || null;
  const guestPhone = contact?.manual_guest_phone?.trim() || null;
  const guestName = resolveGuestDisplayName(contact as any);

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
    // Clipboard access fails in in-app browsers / non-secure contexts. Tell the
    // user instead of silently doing nothing — the URL stays on screen to select.
    const ok = await copyText(lastUrl);
    if (!ok) {
      toast.error("Couldn't reach the clipboard — select the link above and copy it manually.");
      return;
    }
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

  const buildWhatsAppText = (url: string) => {
    const fmt = (d?: string) => (d ? format(new Date(d), "MMM d, yyyy") : "");
    return `Hi ${guestName}, this is Lamai Muay Thai regarding your accommodation booking from ${fmt(contact?.check_in)} to ${fmt(contact?.check_out)}. Here is your secure deposit payment link: ${url} — once paid, your accommodation deposit will be confirmed.`;
  };

  const handleWhatsAppCopy = async () => {
    if (!lastUrl) return;
    const ok = await copyText(buildWhatsAppText(lastUrl));
    if (!ok) {
      toast.error("Couldn't reach the clipboard — copy the link above manually.");
      return;
    }
    setWaCopied(true);
    toast.success(guestPhone ? `Message ready for ${guestPhone}` : "Message copied — paste into WhatsApp / LINE");
    setTimeout(() => setWaCopied(false), 2000);
  };


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

      {contact && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
          <span className="font-medium text-foreground">{guestName}</span>
          {guestEmail ? (
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{guestEmail}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[hsl(var(--warning))]">
              <AlertCircle className="h-3 w-3" /> No email — link won't auto-send
            </span>
          )}
          {guestPhone && (
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{guestPhone}</span>
          )}
        </div>
      )}

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
            {!lastResult.email_sent && !guestEmail && (
              <Badge variant="outline" className="gap-1 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40">
                <AlertCircle className="h-3 w-3" /> Manual delivery only
              </Badge>
            )}
          </div>
          {/* Readonly input, not a div: if the clipboard API is blocked the
              staffer can still tap-and-hold / ctrl+A to grab the URL. */}
          <input
            readOnly
            value={lastUrl}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono text-foreground"
          />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-2">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleWhatsAppCopy} className="gap-2">
              {waCopied ? <Check className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
              {waCopied ? "Copied" : `Copy WhatsApp message${guestPhone ? "" : " (no phone on file)"}`}
            </Button>
          </div>
        </div>
      )}

      {/* An active link exists but its URL isn't on screen — the raw token is
          only ever returned once at creation (we store a hash), so there is
          nothing to copy until a fresh link is generated. Say so plainly. */}
      {active && !lastUrl && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">There's already an active link for this booking</span>
            {" "}— but the address is only shown once, right after it's created, for security.
            The guest still has it in their email and portal. To get a copyable link now, hit
            <span className="font-medium text-foreground"> Regenerate</span> below; the old one stops working.
          </div>
        </div>
      )}



      {blocked && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-semibold text-foreground">Online Stripe payments are not live yet.</div>
            <div className="text-muted-foreground mt-0.5">
              {readiness?.next_action || "Live key and webhook smoke test are required before sending payment links."}
            </div>
            <div className="text-muted-foreground mt-0.5 italic">
              Don't send guests into the payment lane until the cash register is actually connected.
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!active && (
          <Button size="sm" onClick={() => createMut.mutate(false)} disabled={createMut.isPending || !!blocked} className="gap-2">
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
            {guestEmail ? "Generate & Send Link" : "Generate Link (copy manually)"}
          </Button>
        )}
        {active && (
          <Button size="sm" variant="outline" onClick={() => createMut.mutate(true)} disabled={createMut.isPending || !!blocked} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            {guestEmail ? "Regenerate & Resend" : "Regenerate Link"}
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
