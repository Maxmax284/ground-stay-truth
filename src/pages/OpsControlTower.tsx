import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { OpsBookingTimelineSheet } from "@/components/ops/OpsBookingTimelineSheet";
import { SystemsMatrixPanel } from "@/components/ops/SystemsMatrixPanel";
import { VerificationPanel } from "@/components/ops/VerificationPanel";
import { AgentActivityPanel } from "@/components/ops/AgentActivityPanel";
import { useAuth } from "@/hooks/useAuth";
import { useFrontDeskData } from "@/hooks/useFrontDesk";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  PowerOff,
  Clock,
  ExternalLink,
  RefreshCw,
  History,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

type Status = "healthy" | "warning" | "broken" | "unknown" | "not_configured" | "pending";

interface ServiceProbe {
  key: string;
  label: string;
  status: Status;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  source: string;
  detail: Record<string, unknown> | null;
}

interface OpsException {
  exception_key: string;
  severity: "high" | "medium" | "low";
  booking_id: string;
  guest_name: string | null;
  unit_name: string | null;
  check_in: string;
  affected_system: string;
  what_failed: string;
  why_matters: string;
  suggested_action: string;
  detail: Record<string, unknown> | null;
}

const STATUS_META: Record<Status, { dot: string; label: string; icon: typeof Activity }> = {
  healthy:        { dot: "bg-emerald-500", label: "Healthy",        icon: CheckCircle2 },
  warning:        { dot: "bg-amber-500",   label: "Warning",        icon: AlertTriangle },
  broken:         { dot: "bg-rose-500",    label: "Broken",         icon: XCircle },
  pending:        { dot: "bg-sky-500",     label: "Pending",        icon: Clock },
  unknown:        { dot: "bg-slate-400",   label: "Unknown",        icon: HelpCircle },
  not_configured: { dot: "bg-slate-300",   label: "Not configured", icon: PowerOff },
};

function StatusDot({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
      <span className="text-xs text-muted-foreground">{m.label}</span>
    </span>
  );
}

function SystemsHealthPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ops-service-health"],
    queryFn: async (): Promise<ServiceProbe[]> => {
      const { data, error } = await supabase.rpc("get_ops_service_health");
      if (error) throw error;
      return (data ?? []) as ServiceProbe[];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Deterministic status per service. Pulled from live log tables — no AI guesses.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Checking systems…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((p) => {
            const Icon = STATUS_META[p.status]?.icon ?? HelpCircle;
            return (
              <Card key={p.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {p.label}
                    </CardTitle>
                    <StatusDot status={p.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Last success</span>
                    <span>{p.last_success_at ? formatDistanceToNow(new Date(p.last_success_at), { addSuffix: true }) : "—"}</span>
                  </div>
                  {p.last_failure_at && (
                    <div className="flex justify-between text-rose-600">
                      <span>Last failure</span>
                      <span>{formatDistanceToNow(new Date(p.last_failure_at), { addSuffix: true })}</span>
                    </div>
                  )}
                  {p.last_error && (
                    <p className="text-rose-600 line-clamp-2 pt-1">{p.last_error}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground pt-1">source: {p.source}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransitMonitorPanel({
  onOpenBooking,
  onOpenTimeline,
}: {
  onOpenBooking: (id: string) => void;
  onOpenTimeline: (id: string) => void;
}) {
  const fd = useFrontDeskData();
  const arriving = fd.sections?.arrivingToday ?? [];
  const upcoming = (fd.sections?.upcoming ?? []).slice(0, 25);
  const pickupByBooking = fd.pickupByBooking ?? new Map();

  const rows = [
    ...arriving.map((b: any) => ({ ...b, _bucket: "Today" })),
    ...upcoming.map((b: any) => ({ ...b, _bucket: "Next 7 days" })),
  ];

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No bookings arriving in the next 7 days.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Guests arriving today and within 7 days. Click Timeline to see every operational event.
      </p>
      <div className="rounded-lg border divide-y">
        {rows.map((b: any) => {
          const pickup = pickupByBooking.get(b.id) as any;
          return (
            <div key={b.id} className="flex items-center gap-3 p-3 text-sm hover:bg-muted/30">
              <Badge variant="outline" className="text-[10px] shrink-0">{b._bucket}</Badge>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{b.guest_name ?? "Unnamed guest"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {b.unit_name ?? "—"} · {format(new Date(b.check_in), "MMM d")}
                  {pickup?.flight_number ? ` · ${pickup.flight_number}` : ""}
                </p>
              </div>
              <div className="hidden sm:flex flex-col items-end text-xs">
                <span className="text-muted-foreground">
                  Pickup: {pickup ? (pickup.driver_id ? "Driver set" : "Unassigned") : "None"}
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onOpenTimeline(b.id)} title="Operational timeline">
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onOpenBooking(b.id)} title="Open booking">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExceptionsPanel({
  onOpenBooking,
  onOpenTimeline,
}: {
  onOpenBooking: (id: string) => void;
  onOpenTimeline: (id: string) => void;
}) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ops-exceptions"],
    queryFn: async (): Promise<OpsException[]> => {
      const { data, error } = await supabase.rpc("get_ops_exceptions");
      if (error) throw error;
      return (data ?? []) as OpsException[];
    },
    refetchInterval: 60_000,
  });

  const sevColor = (s: string) =>
    s === "high" ? "bg-rose-500/10 text-rose-700 border-rose-500/20"
    : s === "medium" ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
    : "bg-slate-500/10 text-slate-700 border-slate-500/20";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Real exceptions only — derived from booking, payment, pickup, document, housekeeping, and inventory tables.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Scanning…</p>
      ) : data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((ex, i) => (
            <Card key={`${ex.exception_key}-${ex.booking_id}-${i}`}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${sevColor(ex.severity)}`}>
                    {ex.severity.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{ex.affected_system}</Badge>
                  <span className="text-sm font-medium">{ex.what_failed}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ex.why_matters}</p>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs">
                    <span className="font-medium">{ex.guest_name ?? "—"}</span>
                    {" · "}{ex.unit_name ?? "—"}
                    {" · "}{format(new Date(ex.check_in), "MMM d")}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => onOpenTimeline(ex.booking_id)}>
                      <History className="h-3.5 w-3.5 mr-1" /> Timeline
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onOpenBooking(ex.booking_id)}>
                      Open booking
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground italic">→ {ex.suggested_action}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          No exceptions. All deterministic checks are clean.
        </CardContent></Card>
      )}
    </div>
  );
}

function TimelineLookupPanel({ onOpenTimeline }: { onOpenTimeline: (id: string) => void }) {
  const [value, setValue] = useState("");
  const { data: recent } = useQuery({
    queryKey: ["ops-timeline-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,check_in,state,unit_id,guest_id,units(name),profiles!bookings_guest_id_fkey(full_name)")
        .order("updated_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Open a timeline</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Paste a booking ID…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button onClick={() => value.trim() && onOpenTimeline(value.trim())}>Open</Button>
          </div>
          <p className="text-xs text-muted-foreground">Or pick from recently updated bookings below.</p>
        </CardContent>
      </Card>

      <div className="rounded-lg border divide-y">
        {(recent ?? []).map((b: any) => (
          <div key={b.id} className="flex items-center gap-3 p-3 text-sm hover:bg-muted/30">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {resolveGuestDisplayName(b)} · {b.units?.name ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(b.check_in), "MMM d")} · {b.state}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onOpenTimeline(b.id)}>
              <History className="h-3.5 w-3.5 mr-1" /> Timeline
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NarrativeSummaryCard() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ops-tower-narrative"],
    queryFn: async (): Promise<{ summary: string; source: string }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-tower-narrative`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            What's actually happening right now
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Reading systems…</p>
        ) : (
          <p className="text-sm leading-relaxed">
            {data?.summary ?? "No narrative available."}
            {data?.source === "deterministic" && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                · deterministic fallback
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function OpsControlTower() {
  const { isAdmin } = useAuth();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [timelineId, setTimelineId] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6" data-ai-focus="ops">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Ops Control Tower
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Admin-only systems health for the LMT CampStay guest journey. Not a Front Desk replacement —
            this answers “is the machine behind the scenes actually working?”
          </p>
        </div>

        <NarrativeSummaryCard />

        <Tabs defaultValue="health">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="health">Systems Health</TabsTrigger>
            <TabsTrigger value="matrix">Matrix</TabsTrigger>
            <TabsTrigger value="transit">Transit Monitor</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="agents">Agent Activity</TabsTrigger>
            <TabsTrigger value="verify">Verification</TabsTrigger>
          </TabsList>

          <TabsContent value="health" className="mt-4">
            <SystemsHealthPanel />
          </TabsContent>
          <TabsContent value="matrix" className="mt-4">
            <SystemsMatrixPanel />
          </TabsContent>
          <TabsContent value="transit" className="mt-4">
            <TransitMonitorPanel onOpenBooking={setDetailId} onOpenTimeline={setTimelineId} />
          </TabsContent>
          <TabsContent value="exceptions" className="mt-4">
            <ExceptionsPanel onOpenBooking={setDetailId} onOpenTimeline={setTimelineId} />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <TimelineLookupPanel onOpenTimeline={setTimelineId} />
          </TabsContent>
          <TabsContent value="agents" className="mt-4">
            <AgentActivityPanel />
          </TabsContent>
          <TabsContent value="verify" className="mt-4">
            <VerificationPanel />
          </TabsContent>
        </Tabs>
      </div>

      <BookingDetailSheet
        bookingId={detailId}
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        isAdmin={isAdmin}
      />

      <OpsBookingTimelineSheet
        bookingId={timelineId}
        open={!!timelineId}
        onOpenChange={(o) => !o && setTimelineId(null)}
      />
    </DashboardLayout>
  );
}
