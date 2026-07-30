import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Mail,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
} from "lucide-react";

/**
 * Staff-only email delivery status for a single booking.
 * ---------------------------------------------------------------------------
 * Reads `email_send_log` (RLS: admin / manager / front desk supervisor only)
 * and deduplicates by message_id so one email shows as one row, not two.
 * Resending is admin-only and always behind a confirmation dialog, because the
 * guest actually receives it.
 */

interface LogRow {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  sent: {
    label: "Delivered to provider",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  pending: {
    label: "Queued",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  dlq: {
    label: "Failed after retries",
    icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  suppressed: {
    label: "Blocked (unsubscribed or bounced)",
    icon: Ban,
    className: "bg-muted text-muted-foreground border-border",
  },
};

function prettyTemplate(name: string | null) {
  if (!name) return "Email";
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BookingEmailStatus({ bookingId }: { bookingId: string }) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canView =
    role === "admin" || role === "manager" || role === "front_desk_supervisor";
  const canResend = role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // Two-step lookup on purpose: send-transactional-email writes the booking_id
    // into metadata on the `pending` row, but the queue worker writes the final
    // `sent` / `dlq` row without it. So we resolve message_ids first, then pull
    // every row for those ids to get the real end state.
    const { data: seedRows, error: seedError } = await supabase
      .from("email_send_log")
      .select("message_id")
      .contains("metadata", { booking_id: bookingId })
      .order("created_at", { ascending: false })
      .limit(50);

    if (seedError) {
      setLoadError(seedError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = Array.from(
      new Set((seedRows ?? []).map((r: any) => r.message_id).filter(Boolean)),
    ) as string[];

    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .in("message_id", ids)
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setRows([]);
    } else {
      // One email = one row. Keep the newest status per message_id.
      const seen = new Set<string>();
      const deduped: LogRow[] = [];
      for (const r of (data ?? []) as LogRow[]) {
        const key = r.message_id ?? r.id;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(r);
      }
      setRows(deduped);
    }
    setLoading(false);
  }, [bookingId]);


  useEffect(() => {
    if (canView) load();
    else setLoading(false);
  }, [canView, load]);

  if (!canView) return null;

  const doResend = async () => {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-booking-confirmation", {
        body: { booking_id: bookingId, resend: true },
      });
      if (error) throw error;
      toast({
        title: "Confirmation resent",
        description: `Sent to ${(data as any)?.recipient ?? "the guest"}. It shows as Queued until the sender picks it up.`,
      });
      setTimeout(load, 1500);
    } catch (e: any) {
      toast({
        title: "Resend failed",
        description: (e?.message || "Unknown error").slice(0, 240),
        variant: "destructive",
      });
    } finally {
      setResending(false);
      setConfirmOpen(false);
    }
  };

  const lastConfirmation = rows.find((r) => r.template_name === "booking_confirmed");

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email status
            <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
              Staff only
            </span>
          </h4>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Every email this booking has sent, newest first. &quot;Delivered to provider&quot;
          means it left our system — it does not guarantee the guest opened it.
        </p>

        {loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Could not load email history: {loadError}
          </div>
        )}

        {!loading && !loadError && rows.length === 0 && (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            No emails logged for this booking yet.
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => {
              const meta = STATUS_META[r.status ?? ""] ?? {
                label: r.status ?? "Unknown",
                icon: Clock,
                className: "bg-muted text-muted-foreground border-border",
              };
              const Icon = meta.icon;
              return (
                <div key={r.id} className="rounded-lg border p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">{prettyTemplate(r.template_name)}</span>
                    <Badge variant="outline" className={`gap-1 text-[10px] ${meta.className}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground break-all">
                    {r.recipient_email} · {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.error_message && (
                    <div className="text-destructive break-words">{r.error_message}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canResend && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Resending sends a real email to the guest with a fresh PDF download
              link. Use it when a guest says they never got the confirmation.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8"
              disabled={resending}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className={`h-3.5 w-3.5 ${resending ? "animate-pulse" : ""}`} />
              {resending ? "Sending…" : "Resend confirmation email"}
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resend the confirmation email?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a real email to the guest right now.
              {lastConfirmation
                ? ` The last confirmation went out ${new Date(
                    lastConfirmation.created_at,
                  ).toLocaleString()}.`
                : " No confirmation has been logged for this booking yet."}{" "}
              Nothing about the booking, payments, or the guest record changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doResend} disabled={resending}>
              {resending ? "Sending…" : "Yes, resend it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
