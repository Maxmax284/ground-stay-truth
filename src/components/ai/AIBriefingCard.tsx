import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Wand2, Loader2, RefreshCw } from "lucide-react";

interface Props {
  bookingId: string | null;
  variant?: "full" | "compact";
}

/**
 * Manual-trigger AI briefing for a booking. Admin/Manager only.
 * - React Query caches result for ~10 minutes per booking to save credits.
 * - Read-only. Logged to staff_audit_events by the edge function.
 */
export function AIBriefingCard({ bookingId, variant = "full" }: Props) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [triggered, setTriggered] = useState(false);

  const allowed = role === "admin" || role === "manager";
  const queryKey = ["ops-booking-narrative", bookingId];

  const { data, isFetching, error, refetch } = useQuery({
    queryKey,
    enabled: false, // manual trigger only
    staleTime: 10 * 60 * 1000, // 10 min cache
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ops-booking-narrative", {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any)?.narrative as string;
    },
  });

  if (!allowed || !bookingId) return null;

  const cached = qc.getQueryData<string>(queryKey);
  const narrative = data ?? cached ?? null;

  const run = async () => {
    setTriggered(true);
    try {
      await refetch();
    } catch (e) {
      toast({ title: "Briefing failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className={`rounded-md border bg-muted/30 ${variant === "compact" ? "p-2.5" : "p-3"} space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Wand2 className="h-3.5 w-3.5 text-primary" />
          AI briefing
          <span className="text-[10px] font-normal text-muted-foreground">· read-only · cached 10m</span>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : narrative ? (
            <RefreshCw className="h-3 w-3 mr-1" />
          ) : null}
          {narrative ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {narrative && (
        <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{narrative}</p>
      )}
      {!narrative && !isFetching && !triggered && (
        <p className="text-[11px] text-muted-foreground">
          Tap Generate for a short story-so-far. No state changes. Logged to audit trail.
        </p>
      )}
      {error && !isFetching && (
        <p className="text-[11px] text-rose-600">{(error as Error).message}</p>
      )}
    </div>
  );
}
