/**
 * Compliance Center — single entry point for GDPR/PDPA tasks, audit trail,
 * retention status, and recovery snapshots. Lives inside Security Center.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  FileDown,
  Trash2,
  ScrollText,
  Database,
  ExternalLink,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuditEvents } from "@/hooks/useStaffAudit";
import { useRecoverySnapshots } from "@/hooks/useRecoverySnapshots";
import { formatDistanceToNow } from "date-fns";

export function ComplianceCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [targetEmail, setTargetEmail] = useState("");
  const [exporting, setExporting] = useState(false);
  const [purging, setPurging] = useState(false);

  const { data: auditEvents = [] } = useStaffAuditEvents({ limit: 25 });
  const { snapshots, isLoading: snapsLoading } = useRecoverySnapshots();

  const lookupUserId = async (email: string): Promise<string | null> => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("email", email.trim())
      .maybeSingle();
    return (data as any)?.user_id ?? null;
  };

  const handleExport = async () => {
    const email = targetEmail.trim();
    if (!email) {
      toast({ title: "Enter a user email first.", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const targetId = await lookupUserId(email);
      if (!targetId) throw new Error("No user found with that email.");

      // Admin-side export: pull the same shape directly from DB since the edge
      // function exports the *caller's* data.
      const [profile, bookings, payments, consents, roles, documents] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", targetId).maybeSingle(),
        supabase.from("bookings").select("*").eq("guest_id", targetId),
        supabase.from("payments").select("*"),
        supabase.from("user_consents").select("*").eq("user_id", targetId),
        supabase.from("user_roles").select("*").eq("user_id", targetId),
        supabase.from("guest_documents").select("id, file_name, created_at, verification_status"),
      ]);

      const payload = {
        export_date: new Date().toISOString(),
        requested_by: user?.email,
        subject: { user_id: targetId, email },
        profile: profile.data,
        roles: roles.data ?? [],
        consents: consents.data ?? [],
        bookings: bookings.data ?? [],
        payments: payments.data ?? [],
        documents: documents.data ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dsar-${email}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      await supabase.rpc("log_staff_audit_event", {
        _event_type: "data_export_requested",
        _severity: "medium",
        _actor_id: user?.id,
        _target_user_id: targetId,
        _reason: "GDPR/PDPA data subject access request",
        _metadata: { email },
      });

      toast({ title: "Export ready", description: `Downloaded data for ${email}.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    try {
      const { error } = await supabase.functions.invoke("cleanup-retention");
      if (error) throw error;
      toast({ title: "Retention cleanup triggered." });
    } catch (e: any) {
      toast({ title: "Cleanup failed", description: e.message, variant: "destructive" });
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Compliance Center
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            One place for GDPR/PDPA requests, audit trail review, retention
            status, and recovery snapshots. If a guest asks for their data, to
            be forgotten, or a regulator asks "show me what happened" — start
            here.
          </p>
        </CardContent>
      </Card>

      {/* GDPR / PDPA tools */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="h-4 w-4 text-primary" />
            Data subject requests (GDPR / PDPA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dsar-email">Guest or staff email</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="dsar-email"
                type="email"
                placeholder="guest@example.com"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
              />
              <Button onClick={handleExport} disabled={exporting} className="shrink-0">
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Export data (JSON)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Exports profile, bookings, payments, consents, roles and document
              metadata. Action is logged to the audit trail.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Right to be forgotten</p>
            <p className="text-xs text-muted-foreground">
              Guests delete their own account from{" "}
              <span className="font-mono">/guest</span> → profile. For staff
              offboarding, use the staff management screen — never delete via
              the database.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings">
                Open staff management <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit trail snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" />
            Recent audit events
            <Badge variant="outline" className="ml-auto text-xs">
              last {auditEvents.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No audit events yet.
            </p>
          ) : (
            <ScrollArea className="h-[260px]">
              <div className="space-y-2 pr-3">
                {auditEvents.map((e: any) => (
                  <div
                    key={e.id}
                    className="flex items-start justify-between gap-3 p-2 rounded border border-border/60 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{e.event_type.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {e.actor_email || "system"} · {e.severity}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Retention */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-primary" />
            Data retention
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Old messages, notifications, and audit logs auto-purge on a 90-day
            rolling window via the <span className="font-mono">cleanup-retention</span>{" "}
            job. Run it manually if you need to force a sweep.
          </p>
          <Button onClick={handlePurge} disabled={purging} variant="outline" size="sm">
            {purging ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Run retention cleanup now
          </Button>
        </CardContent>
      </Card>

      {/* Recovery snapshots */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            Recovery snapshots
            <Badge variant="outline" className="ml-auto text-xs">
              {snapshots.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots captured yet.</p>
          ) : (
            <div className="space-y-1 text-sm">
              {snapshots.slice(0, 3).map((s) => (
                <div key={s.id} className="flex justify-between">
                  <span className="truncate">{s.label}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/disaster-recovery">
              Open Disaster Recovery <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
