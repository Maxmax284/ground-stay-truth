/**
 * TM30 Confirmation Row
 *
 * Staff-only toggle that marks TM30 as filed for a booking. No upload required —
 * we only need to know it was done. Stored in bookings.arrival_details.tm30
 * as { confirmed_at, confirmed_by } to avoid a schema migration.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

interface Props {
  bookingId: string;
  label: string;
  subtitle?: string;
}

interface Tm30State {
  confirmed_at: string | null;
  confirmed_by: string | null;
}

export function Tm30ConfirmRow({ bookingId, label, subtitle }: Props) {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isStaff = permissions.isStaff(role);

  const { data, isLoading } = useQuery({
    queryKey: ["booking-tm30", bookingId],
    queryFn: async (): Promise<Tm30State> => {
      const { data, error } = await supabase
        .from("bookings")
        .select("arrival_details")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      const ad = (data?.arrival_details ?? {}) as any;
      const tm30 = ad?.tm30 ?? {};
      return {
        confirmed_at: tm30.confirmed_at ?? null,
        confirmed_by: tm30.confirmed_by ?? null,
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async (confirm: boolean) => {
      const { data: row, error: readErr } = await supabase
        .from("bookings")
        .select("arrival_details")
        .eq("id", bookingId)
        .maybeSingle();
      if (readErr) throw readErr;
      const current = ((row?.arrival_details as any) ?? {}) as Record<string, any>;
      const next = {
        ...current,
        tm30: confirm
          ? { confirmed_at: new Date().toISOString(), confirmed_by: user?.id ?? null }
          : { confirmed_at: null, confirmed_by: null },
      };
      const { error } = await supabase
        .from("bookings")
        .update({ arrival_details: next })
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-tm30", bookingId] });
      qc.invalidateQueries({ queryKey: ["front-desk"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const confirmed = !!data?.confirmed_at;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            {confirmed ? (
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
            {label}
          </h4>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 pl-6">{subtitle}</p>
          )}
        </div>
        {confirmed ? (
          <Badge className="text-xs bg-success/20 text-[hsl(var(--success))] shrink-0">Filed</Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">Not filed</Badge>
        )}
      </div>

      {confirmed && data?.confirmed_at && (
        <p className="text-xs text-muted-foreground pl-6">
          Confirmed {format(new Date(data.confirmed_at), "MMM d, yyyy 'at' p")}
        </p>
      )}

      {isStaff && (
        <Button
          variant={confirmed ? "outline" : "default"}
          size="sm"
          className="w-full"
          disabled={isLoading || mutation.isPending}
          onClick={() => mutation.mutate(!confirmed)}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : confirmed ? (
            <Circle className="h-4 w-4 mr-2" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          {confirmed ? "Mark as not filed" : "Mark TM30 as filed"}
        </Button>
      )}
    </div>
  );
}
