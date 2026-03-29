/**
 * Security Event Log Viewer — Admin-only component
 * Shows audit trail of all Fenrir Lock security events.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  critical: "bg-destructive/20 text-destructive",
};

export function SecurityEventLog() {
  const { role } = useAuth();

  const { data: events, isLoading } = useQuery({
    queryKey: ["security-events"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  if (role !== "admin") return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-primary" />
          Security Event Log
          <Badge variant="outline" className="ml-auto text-xs">
            {events?.length ?? 0} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading security events…</p>
        ) : !events?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No security events recorded yet.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {events.map((event: any) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50"
                >
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {event.event_type.replace(/_/g, " ")}
                      </span>
                      <Badge className={`text-xs ${SEVERITY_COLORS[event.severity] || ""}`}>
                        {event.severity}
                      </Badge>
                      {event.confidence_score && (
                        <span className="text-xs text-muted-foreground">
                          {event.confidence_score}% confidence
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {event.actor_email || event.actor_role || "System"} · {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
