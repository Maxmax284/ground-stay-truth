import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function WebhookHealthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["webhook-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_health")
        .select("*")
        .eq("provider", "stripe")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 30_000,
  });

  const reason: string = data?.last_failure_reason ?? "";
  const isUnsignedProbe = /missing stripe-signature/i.test(reason);
  const hasSuccess = !!data?.last_success_at;
  const rawStatus = data?.status ?? "unknown";

  // A failure caused only by an unsigned probe/scanner is not a real Stripe failure.
  const effectiveStatus =
    rawStatus === "healthy" && hasSuccess
      ? "healthy"
      : rawStatus === "failing" && !isUnsignedProbe
        ? "failing"
        : "awaiting";

  const badge =
    effectiveStatus === "healthy"
      ? { label: "Stripe webhook verified", icon: CheckCircle2, variant: "default" as const }
      : effectiveStatus === "failing"
        ? { label: "Signature verification failed", icon: AlertTriangle, variant: "destructive" as const }
        : { label: "Awaiting first Stripe event", icon: Clock, variant: "secondary" as const };
  const Icon = badge.icon;

  const explainer =
    effectiveStatus === "healthy"
      ? "Stripe events are arriving and passing signature verification."
      : effectiveStatus === "failing"
        ? "Stripe signature verification failed. Check the webhook secret or Stripe endpoint configuration."
        : isUnsignedProbe
          ? "Unsigned request rejected. This is expected for non-Stripe probes and does not mean Stripe is failing."
          : "Awaiting first Stripe event. Send a test event from the Stripe dashboard or take a live payment to verify.";
      </CardContent>
    </Card>
  );
}
