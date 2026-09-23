import { useState } from "react";
import { format } from "date-fns";
import { Plane, PlusCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useFlightBudget, useGrantFlightBudget } from "@/hooks/useFlightBudget";
import { toast } from "sonner";

/** Admin-only view of today's paid flight lookups, with a same-day top-up. */
export function FlightBudgetPanel() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { data, isLoading } = useFlightBudget(isAdmin);
  const grant = useGrantFlightBudget();
  const [extra, setExtra] = useState("5");
  const [reason, setReason] = useState("");

  if (!isAdmin) return null;
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;

  const submit = async () => {
    try {
      await grant.mutateAsync({ extra_reads: Number(extra), reason });
      setReason("");
      toast.success("Extra flight lookups added for today.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not add extra lookups.");
    }
  };

  const spent = data.remaining === 0;

  return (
    <Card className={spent ? "border-destructive/40" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Plane className="h-4 w-4 text-primary" /> Flight lookup budget
          <Badge variant={spent ? "destructive" : "secondary"} className="ml-auto">
            {data.remaining} left today
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Used today", value: data.used },
            { label: "Remaining", value: data.remaining },
            { label: "Daily cap", value: data.base },
            { label: "Extra granted", value: data.grantedExtra },
          ].map((s) => (
            <div key={s.label} className="rounded-md border p-2">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Top up today only</Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-24">
              <Input
                type="number"
                min={1}
                max={200}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                aria-label="Extra lookups"
              />
            </div>
            <Input
              className="min-w-[12rem] flex-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why the extra lookups are needed"
              maxLength={300}
            />
            <Button onClick={() => void submit()} disabled={grant.isPending || reason.trim().length < 3}>
              <PlusCircle className="mr-2 h-4 w-4" /> {grant.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Applies to today only. Tomorrow goes back to {data.base} paid lookups.
          </p>
        </div>

        {data.grants.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold">Today's top-ups</p>
            {data.grants.map((g) => (
              <p key={g.id} className="text-[11px] text-muted-foreground">
                +{g.extra_reads} · {g.reason} · {format(new Date(g.created_at), "HH:mm")}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs font-semibold">Paid lookups today</p>
          {data.reads.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">None yet today.</p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {data.reads.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
                  <span className="font-mono">{format(new Date(r.created_at), "HH:mm")}</span>
                  <span className="text-muted-foreground">{r.provider}</span>
                  <span className="font-mono">{r.flight_key ?? "—"}</span>
                  <Badge variant={r.outcome === "ok" ? "secondary" : "outline"} className="ml-auto text-[10px]">
                    {r.outcome}
                    {r.http_status ? ` · ${r.http_status}` : ""}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
