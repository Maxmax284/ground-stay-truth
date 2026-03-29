import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogIn, LogOut, Sparkles, Wrench, Shirt, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useCountUp } from "@/hooks/useCountUp";
import { useTranslation } from "react-i18next";

interface QuickStat {
  label: string;
  count: number;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
  urgent?: boolean;
}

export function StaffQuickActionsWidget() {
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["staff-quick-actions", today],
    queryFn: async () => {
      const [checkIns, checkOuts, housekeeping, maintenance, laundry] = await Promise.all([
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("check_in", today)
          .in("state", ["confirmed", "pending_deposit"]),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("check_out", today)
          .eq("state", "checked_in"),
        supabase
          .from("housekeeping_tasks")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"]),
        supabase
          .from("maintenance_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress"]),
        supabase
          .from("laundry_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["received", "washing"]),
      ]);

      return {
        checkIns: checkIns.count ?? 0,
        checkOuts: checkOuts.count ?? 0,
        housekeeping: housekeeping.count ?? 0,
        maintenance: maintenance.count ?? 0,
        laundry: laundry.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  const stats: QuickStat[] = [
    {
      label: "Check-ins",
      count: data?.checkIns ?? 0,
      icon: LogIn,
      color: "text-emerald-600 dark:text-emerald-400",
      onClick: () => navigate("/bookings?filter=arriving_today"),
      urgent: (data?.checkIns ?? 0) > 0,
    },
    {
      label: "Check-outs",
      count: data?.checkOuts ?? 0,
      icon: LogOut,
      color: "text-amber-600 dark:text-amber-400",
      onClick: () => navigate("/bookings?filter=departing_today"),
      urgent: (data?.checkOuts ?? 0) > 0,
    },
    {
      label: "Housekeeping",
      count: data?.housekeeping ?? 0,
      icon: ClipboardList,
      color: "text-blue-600 dark:text-blue-400",
      onClick: () => {
        const el = document.getElementById("housekeeping-panel");
        el?.scrollIntoView({ behavior: "smooth" });
      },
    },
    {
      label: "Maintenance",
      count: data?.maintenance ?? 0,
      icon: Wrench,
      color: "text-orange-600 dark:text-orange-400",
      onClick: () => {
        const el = document.getElementById("maintenance-queue");
        el?.scrollIntoView({ behavior: "smooth" });
      },
    },
    {
      label: "Laundry",
      count: data?.laundry ?? 0,
      icon: Shirt,
      color: "text-violet-600 dark:text-violet-400",
      onClick: () => {
        const el = document.getElementById("laundry-panel");
        el?.scrollIntoView({ behavior: "smooth" });
      },
    },
  ];

  const totalPending = stats.reduce((s, t) => s + t.count, 0);

  return (
    <Card className="border-primary/20 animate-fade-up">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Today's Tasks
          </CardTitle>
          {totalPending > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalPending} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {stats.map((stat) => (
            <QuickStatTile key={stat.label} stat={stat} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickStatTile({ stat }: { stat: QuickStat }) {
  const animated = useCountUp(stat.count);
  const Icon = stat.icon;

  return (
    <Button
      variant="outline"
      className={`h-auto flex-col gap-1 py-3 px-2 relative transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
        stat.urgent ? "border-primary/30 bg-primary/5" : ""
      }`}
      onClick={stat.onClick}
    >
      <Icon className={`h-5 w-5 ${stat.color}`} />
      <span className="text-xl font-bold tabular-nums">{animated}</span>
      <span className="text-[10px] text-muted-foreground font-medium leading-tight">{stat.label}</span>
      {stat.urgent && stat.count > 0 && (
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
    </Button>
  );
}
