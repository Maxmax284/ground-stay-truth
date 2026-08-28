import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Loader2, ShieldAlert } from "lucide-react";

type ProbeResult = { ok: boolean; detail: string } | null;

export function VerificationPanel() {
  const { user } = useAuth();
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, ProbeResult>>({});

  const run = async (key: string, fn: () => Promise<{ ok: boolean; detail: string }>) => {
    setRunning((s) => ({ ...s, [key]: true }));
    try {
      const r = await fn();
      setResults((s) => ({ ...s, [key]: r }));
      toast({
        title: r.ok ? "Probe passed" : "Probe failed",
        description: r.detail,
        variant: r.ok ? "default" : "destructive",
      });
    } catch (e: any) {
      setResults((s) => ({ ...s, [key]: { ok: false, detail: e?.message ?? "Unknown error" } }));
      toast({ title: "Probe error", description: e?.message, variant: "destructive" });
    } finally {
      setRunning((s) => ({ ...s, [key]: false }));
    }
  };

  const probes = [
    {
      key: "stripe_health",
      title: "Stripe webhook freshness",
      desc: "Reads webhook_health for stripe. Safe; no calls to Stripe.",
      run: async () => {
        const { data, error } = await supabase
          .from("webhook_health")
          .select("status,last_success_at,last_failure_reason")
          .eq("provider", "stripe")
          .maybeSingle();
        if (error) return { ok: false, detail: error.message };
        if (!data) return { ok: true, detail: "Awaiting first Stripe event." };
        const reason = data.last_failure_reason ?? "";
        const isUnsignedProbe = /missing stripe-signature/i.test(reason);
        if (data.status === "healthy" && data.last_success_at) {
          return { ok: true, detail: `Stripe webhook verified (last success ${data.last_success_at}).` };
        }
        if (data.status === "failing" && !isUnsignedProbe) {
          return { ok: false, detail: `Stripe signature verification failed. Check webhook secret or Stripe endpoint configuration. (${reason})` };
        }
        return { ok: true, detail: "Awaiting first Stripe event." };
      },
    },
    {
      key: "messaging_ping",
      title: "Messaging system ping",
      desc: "Invokes messaging-system-ping. Sends nothing to guests.",
      run: async () => {
        const { data, error } = await supabase.functions.invoke("messaging-system-ping");
        if (error) return { ok: false, detail: error.message };
        return { ok: true, detail: typeof data === "string" ? data : JSON.stringify(data).slice(0, 200) };
      },
    },
    {
      key: "email_self",
      title: "Email self-test (to me)",
      desc: `Sends one app email only to ${user?.email ?? "your admin address"}.`,
      run: async () => {
        if (!user?.email) return { ok: false, detail: "No admin email on session." };
        const { data, error } = await supabase.functions.invoke("ops-email-selftest");
        if (error) return { ok: false, detail: error.message };
        if (data && data.ok === false) return { ok: false, detail: data.error ?? "Send failed." };
        return { ok: true, detail: `Sent to ${user.email}. Check inbox + email log.` };
      },
    },
    {
      key: "flight_api",
      title: "Flight API freshness",
      desc: "Reads flight_tracking.last_checked_at. No external call.",
      run: async () => {
        const { data, error } = await supabase
          .from("flight_tracking")
          .select("last_checked_at")
          .order("last_checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return { ok: false, detail: error.message };
        if (!data?.last_checked_at) return { ok: false, detail: "No flight checks recorded yet." };
        const ageMin = Math.round((Date.now() - new Date(data.last_checked_at).getTime()) / 60000);
        return { ok: ageMin < 360, detail: `Last check ${ageMin} min ago.` };
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-3 flex items-start gap-2 text-sm">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-amber-900">
            All probes are read-only or send only to your own admin email. Nothing goes to guests.
            Each run is logged to staff_audit_events.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {probes.map((p) => {
          const r = results[p.key];
          return (
            <Card key={p.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  {p.title}
                  {r && (
                    <Badge variant="outline" className={r.ok ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-rose-500/10 text-rose-700 border-rose-500/20"}>
                      {r.ok ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {r.ok ? "Pass" : "Fail"}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">{p.desc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(p.key, async () => {
                      const res = await p.run();
                      void supabase.rpc("log_staff_audit_event", {
                        _event_type: `ops.verification.${p.key}`,
                        _severity: res.ok ? "info" : "warning",
                        _actor_id: user?.id,
                        _reason: res.detail,
                        _metadata: { source: "ops_control_tower" },
                      });
                      return res;
                    })
                  }
                  disabled={!!running[p.key]}
                >
                  {running[p.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Run probe
                </Button>
                {r && <p className="text-[11px] text-muted-foreground break-words">{r.detail}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
