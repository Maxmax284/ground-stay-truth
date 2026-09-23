import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare } from "lucide-react";
import { useDriverResponseRate, RESPONSE_WINDOW_DAYS } from "@/hooks/useDriverResponseRate";

/** How many drivers actually answer, versus just opening the link. Last 30 days. */
export function DriverResponseRateStrip() {
  const { data, isLoading } = useDriverResponseRate();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.sent === 0) return null;

  return (
    <Card className="border-primary/25">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            Driver reply rate {data.rate === null ? "—" : `${data.rate}%`}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span>{data.sent} links sent</span>
          <span>{data.opened} opened</span>
          <span>{data.replied} replied</span>
          <span>Last {RESPONSE_WINDOW_DAYS} days</span>
        </div>
        <p className="w-full text-[11px] text-muted-foreground">
          Counts opened links where the driver sent at least one message.
        </p>
      </CardContent>
    </Card>
  );
}
