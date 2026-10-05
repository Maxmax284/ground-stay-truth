import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { TrendingDown, TrendingUp, Minus, UserX, IdCard, MailWarning } from "lucide-react";

type Week = {
  week_start: string;
  portal_loaded: number;
  booking_missing: number;
  booking_missing_guests: number;
  id_upload_started: number;
  id_upload_success: number;
  id_docs_rejected: number;
  emails_sent: number;
  emails_failed: number;
  emails_bounced: number;
};

/** Weekly Friction Radar — read-only pattern view. Counts, never people. */
export function FrictionRadarPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["friction-radar-weekly"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_friction_radar_weekly", { _weeks: 6 });
      if (error) throw error;
      return (data ?? []) as Week[];
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <p className="text-sm text-destructive">Friction Radar failed to load: {(error as Error).message}</p>;
  const weeks = data ?? [];
  const [cur, prev] = weeks;

  const idFail = (w?: Week) => (w ? Math.max(w.id_upload_started - w.id_upload_success, 0) : 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Patterns, not people. Weeks start Monday. Test bookings excluded. Nothing here changes a booking.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={<UserX className="h-4 w-4" />} title="Can't see their booking"
          value={cur?.booking_missing_guests ?? 0} prev={prev?.booking_missing_guests}
          hint={`${cur?.booking_missing ?? 0} portal loads with no booking linked — usually a second guest account. Merge in Guest Directory.`} />
        <Metric icon={<IdCard className="h-4 w-4" />} title="ID upload friction"
          value={idFail(cur) + (cur?.id_docs_rejected ?? 0)} prev={prev ? idFail(prev) + prev.id_docs_rejected : undefined}
          hint={`${cur?.id_upload_started ?? 0} started · ${cur?.id_upload_success ?? 0} finished · ${cur?.id_docs_rejected ?? 0} rejected`} />
        <Metric icon={<MailWarning className="h-4 w-4" />} title="Emails not delivered"
          value={cur?.emails_failed ?? 0} prev={prev?.emails_failed}
          hint={`${cur?.emails_sent ?? 0} sent · ${cur?.emails_bounced ?? 0} bounced. Bounced guests show a warning on their Status page.`} />
      </div>
      <Card className="camp-pass">
        <CardHeader className="pb-2"><CardTitle className="camp-pass-meta">Last 6 weeks</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-3">Week of</th><th className="pr-3">Portal loads</th>
                <th className="pr-3">No booking (guests)</th><th className="pr-3">ID started/finished</th>
                <th className="pr-3">ID rejected</th><th className="pr-3">Emails sent</th><th>Failed / bounced</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week_start} className="border-t border-border">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{format(parseISO(w.week_start), "d MMM")}</td>
                  <td className="pr-3">{w.portal_loaded}</td>
                  <td className="pr-3">{w.booking_missing} ({w.booking_missing_guests})</td>
                  <td className="pr-3">{w.id_upload_started}/{w.id_upload_success}</td>
                  <td className="pr-3">{w.id_docs_rejected}</td>
                  <td className="pr-3">{w.emails_sent}</td>
                  <td>{w.emails_failed} / {w.emails_bounced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, title, value, prev, hint }: { icon: React.ReactNode; title: string; value: number; prev?: number; hint: string }) {
  const diff = prev === undefined ? 0 : value - prev;
  const Trend = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <Card className={`camp-pass ${diff > 0 ? "border-warning/40" : ""}`}>
      <CardHeader className="pb-1">
        <CardTitle className="camp-pass-meta flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span key={String(value)} className="board-flip inline-block text-2xl font-bold">{value}</span>
          <span className={`text-xs flex items-center gap-1 ${diff > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
            <Trend className="h-3 w-3" /> {prev === undefined ? "this week" : `${diff > 0 ? "+" : ""}${diff} vs last week`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
