/**
 * Today's Briefing — surfaces a plain-English summary of today's operations.
 * Two modes (toggle persisted in localStorage):
 *   • Stats — deterministic counters (default, free, offline-safe)
 *   • Narrative — AI-written paragraph via the existing ai-assistant function
 *
 * No new business logic, no mutations. Reads only.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Sun, Loader2 } from "lucide-react";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

import { usePolicySettings } from "@/hooks/usePolicySettings";

interface Props {
  sections: {
    arrivingToday: FrontDeskBooking[];
    arrivedNotCheckedIn: FrontDeskBooking[];
    currentlyStaying: FrontDeskBooking[];
    departingToday: FrontDeskBooking[];
    upcoming: FrontDeskBooking[];
  };
  todaysPickupCount: number;
  turnoverPendingCount: number;
}

const STORAGE_KEY = "front-desk.briefing.narrative";

export function TodaysBriefing({ sections, todaysPickupCount, turnoverPendingCount }: Props) {
  const { data: policies } = usePolicySettings();
  const policyDefault = useMemo(() => {
    const s = policies?.find((p) => p.key === "front_desk_briefing_narrative_default");
    return s ? String(s.value) === "true" : false;
  }, [policies]);

  const [narrative, setNarrative] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true" || stored === "false") {
      setNarrative(stored === "true");
    } else {
      setNarrative(policyDefault);
    }
  }, [policyDefault]);

  const stats = useMemo(() => buildStats(sections, todaysPickupCount, turnoverPendingCount), [
    sections,
    todaysPickupCount,
    turnoverPendingCount,
  ]);

  useEffect(() => {
    if (!narrative) return;
    if (aiText) return;
    let cancelled = false;
    setLoadingAi(true);
    (async () => {
      try {
        const prompt =
          "Write a warm 2-3 sentence morning briefing for front desk staff based ONLY on these facts. " +
          "Be specific. No marketing language. No fabrication.\n\n" +
          stats.facts;
        const { data, error } = await supabase.functions.invoke("ai-assistant", {
          body: { message: prompt, mode: "briefing" },
        });
        if (cancelled) return;
        if (error) throw error;
        let text: any = null;
        if (typeof data === "string") {
          text = data;
        } else if (data && typeof data === "object") {
          const d: any = data;
          const candidate = d.reply ?? d.message ?? d.content ?? d.output ?? null;
          if (typeof candidate === "string") text = candidate;
        }
        setAiText(typeof text === "string" && text.trim() ? text : stats.deterministic);
      } catch {
        if (!cancelled) setAiText(stats.deterministic);
      } finally {
        if (!cancelled) setLoadingAi(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [narrative, stats, aiText]);

  const toggle = (v: boolean) => {
    setNarrative(v);
    localStorage.setItem(STORAGE_KEY, String(v));
    if (!v) setAiText(null);
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Sun className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Today's Briefing · {format(new Date(), "EEE, MMM d")}
              </div>
              <div className="text-sm text-foreground mt-1 leading-relaxed">
                {narrative ? (
                  loadingAi ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Drafting narration…
                    </span>
                  ) : (
                    aiText ?? stats.deterministic
                  )
                ) : (
                  stats.deterministic
                )}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0 cursor-pointer">
            <Sparkles className="h-3 w-3" />
            AI narration
            <Switch checked={narrative} onCheckedChange={toggle} />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

function buildStats(
  sections: Props["sections"],
  pickupCount: number,
  turnoverPending: number,
): { deterministic: string; facts: string } {
  const a = sections.arrivingToday.length;
  const w = sections.arrivedNotCheckedIn.length;
  const s = sections.currentlyStaying.length;
  const d = sections.departingToday.length;
  const u = sections.upcoming.length;
  const issues = sections.arrivingToday.filter(
    (b) => !b.depositPaid || b.outstanding > 0 || b.docCount === 0,
  ).length;
  const balances = [...sections.arrivingToday, ...sections.currentlyStaying, ...sections.departingToday].filter(
    (b) => b.outstanding > 0,
  ).length;

  const parts: string[] = [];
  if (a > 0) parts.push(`${a} arriving today`);
  if (w > 0) parts.push(`${w} waiting to check in`);
  if (s > 0) parts.push(`${s} currently staying`);
  if (d > 0) parts.push(`${d} departing`);
  if (pickupCount > 0) parts.push(`${pickupCount} airport pickup${pickupCount > 1 ? "s" : ""}`);
  if (turnoverPending > 0) parts.push(`${turnoverPending} room${turnoverPending > 1 ? "s" : ""} pending turnover`);
  if (balances > 0) parts.push(`${balances} outstanding balance${balances > 1 ? "s" : ""}`);
  if (issues > 0) parts.push(`${issues} arrival issue${issues > 1 ? "s" : ""}`);

  const deterministic =
    parts.length === 0
      ? "Quiet day. Nothing urgent on the board."
      : parts.join(" · ") + ".";

  const facts =
    `Arriving today: ${a}\n` +
    `Already arrived, awaiting check-in: ${w}\n` +
    `Currently staying: ${s}\n` +
    `Departing today: ${d}\n` +
    `Upcoming next 7 days: ${u}\n` +
    `Airport pickups today: ${pickupCount}\n` +
    `Rooms pending turnover: ${turnoverPending}\n` +
    `Outstanding balances: ${balances}\n` +
    `Arrival problems (deposit/balance/docs): ${issues}`;

  return { deterministic, facts };
}
