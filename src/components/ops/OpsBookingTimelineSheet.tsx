import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  GitBranch,
  CreditCard,
  Link as LinkIcon,
  Plane,
  Sparkles,
  ShieldCheck,
  Footprints,
  Activity,
  Wand2,
  Loader2,
} from "lucide-react";

interface TimelineEvent {
  occurred_at: string;
  category: string;
  label: string;
  detail: string | null;
  actor: string | null;
  data: Record<string, unknown> | null;
}

const CATEGORY_META: Record<string, { icon: typeof Activity; tone: string; label: string }> = {
  state:        { icon: GitBranch,   tone: "bg-sky-500/10 text-sky-700 border-sky-500/20",         label: "State" },
  payment:      { icon: CreditCard,  tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20", label: "Payment" },
  payment_link: { icon: LinkIcon,    tone: "bg-violet-500/10 text-violet-700 border-violet-500/20", label: "Payment link" },
  pickup:       { icon: Plane,       tone: "bg-amber-500/10 text-amber-700 border-amber-500/20",   label: "Pickup" },
  arrival:      { icon: Footprints,  tone: "bg-teal-500/10 text-teal-700 border-teal-500/20",      label: "Arrival" },
  housekeeping: { icon: Sparkles,    tone: "bg-pink-500/10 text-pink-700 border-pink-500/20",      label: "Housekeeping" },
  audit:        { icon: ShieldCheck, tone: "bg-slate-500/10 text-slate-700 border-slate-500/20",   label: "Audit" },
};

export function OpsBookingTimelineSheet({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ops-booking-timeline", bookingId],
    enabled: !!bookingId && open,
    queryFn: async (): Promise<TimelineEvent[]> => {
      const { data, error } = await supabase.rpc("get_booking_operational_timeline", {
        _booking_id: bookingId,
      });
      if (error) throw error;
      return (data ?? []) as TimelineEvent[];
    },
  });

  const [narrative, setNarrative] = useState<string | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(false);

  const runNarrative = async () => {
    if (!bookingId) return;
    setLoadingNarrative(true);
    setNarrative(null);
    try {
      const { data, error } = await supabase.functions.invoke("ops-booking-narrative", {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setNarrative((data as any)?.narrative ?? "(no narrative)");
    } catch (e) {
      toast({ title: "Narrative failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingNarrative(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Operational Timeline
          </SheetTitle>
          <SheetDescription>
            Everything that happened to this booking across state, payments, pickup, arrival, and housekeeping.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading timeline…</p>
          ) : error ? (
            <p className="text-sm text-rose-600">Failed to load: {(error as Error).message}</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operational events recorded for this booking.</p>
          ) : (
            <ol className="relative border-l border-border pl-4 space-y-3 pb-6">
              {data.map((ev, i) => {
                const meta = CATEGORY_META[ev.category] ?? { icon: Activity, tone: "bg-slate-500/10 text-slate-700 border-slate-500/20", label: ev.category };
                const Icon = meta.icon;
                return (
                  <li key={i} className="relative">
                    <span className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full bg-background border-2 border-primary" />
                    <div className="rounded-md border p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
                          <span className="text-sm font-medium truncate">{ev.label}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {format(new Date(ev.occurred_at), "MMM d, HH:mm")}
                        </span>
                      </div>
                      {ev.detail && <p className="text-xs text-muted-foreground">{ev.detail}</p>}
                      {ev.actor && (
                        <p className="text-[11px] text-muted-foreground">by {ev.actor}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
