/**
 * DRSSnapshots — configuration snapshot tab inside Disaster Recovery.
 * Captures policy_settings, pricing_rules, properties, units, user_roles
 * into recovery_snapshots for forensic diff & restore-preview.
 * Admin-only; no booking/payment/PII data is captured.
 */
import { useMemo, useState } from "react";
import { Camera, Download, Trash2, AlertTriangle, Diff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useRecoverySnapshots, type RecoverySnapshot } from "@/hooks/useRecoverySnapshots";
import { useRecoveryAuditLog } from "@/hooks/useRecoveryAuditLog";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const CAPTURED_TABLES = ["policy_settings", "pricing_rules", "properties", "units", "user_roles"] as const;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function DRSSnapshots() {
  const { snapshots, isLoading, create, remove, fetchPayload } = useRecoverySnapshots();
  const { logAction } = useRecoveryAuditLog();

  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [diffOf, setDiffOf] = useState<RecoverySnapshot | null>(null);
  const [diffData, setDiffData] = useState<Record<string, { snapshot: number; current: number }> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecoverySnapshot | null>(null);

  const submit = async () => {
    if (!label.trim()) {
      toast.error("Label required");
      return;
    }
    try {
      await create.mutateAsync({ label: label.trim(), notes: notes.trim() || undefined });
      await logAction.mutateAsync({
        action: `Recovery snapshot created: ${label.trim()}`,
        category: "database",
        outcome: "success",
      });
      toast.success("Snapshot captured");
      setCreating(false);
      setLabel("");
      setNotes("");
    } catch (e: any) {
      toast.error(e?.message ?? "Snapshot failed");
    }
  };

  const openDiff = async (s: RecoverySnapshot) => {
    setDiffOf(s);
    setDiffData(null);
    try {
      const counts: Record<string, { snapshot: number; current: number }> = {};
      for (const t of CAPTURED_TABLES) {
        const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true });
        counts[t] = {
          snapshot: Number(s.table_counts?.[t] ?? 0),
          current: Number(count ?? 0),
        };
      }
      setDiffData(counts);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to compute diff");
    }
  };

  const exportSnapshot = async (s: RecoverySnapshot) => {
    try {
      const payload = await fetchPayload(s.id);
      const blob = new Blob([JSON.stringify({ snapshot: s, payload }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snapshot-${s.label.replace(/\s+/g, "_")}-${s.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await logAction.mutateAsync({
        action: `Recovery snapshot exported: ${s.label}`,
        category: "database",
        outcome: "success",
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await remove.mutateAsync(confirmDelete.id);
      await logAction.mutateAsync({
        action: `Recovery snapshot deleted: ${confirmDelete.label}`,
        category: "database",
        outcome: "success",
      });
      toast.success("Snapshot deleted");
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  const totalSize = useMemo(
    () => snapshots.reduce((a, s) => a + (s.size_bytes ?? 0), 0),
    [snapshots],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Configuration Snapshots
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Point-in-time copies of operational configuration: policies, pricing,
            properties, units, and roles. No bookings, payments, or guest PII are captured.
            Use for forensic comparison or pre-change restore preview.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <Camera className="h-4 w-4 mr-2" /> New snapshot
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total snapshots</p>
            <p className="text-xl font-semibold">{snapshots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total size</p>
            <p className="text-xl font-semibold">{formatBytes(totalSize)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Tables captured</p>
            <p className="text-xl font-semibold">{CAPTURED_TABLES.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Latest</p>
            <p className="text-sm font-semibold truncate">
              {snapshots[0]
                ? formatDistanceToNow(new Date(snapshots[0].created_at), { addSuffix: true })
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-700 dark:text-yellow-300 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Snapshots are preview-only</p>
            <p className="text-xs text-muted-foreground mt-1">
              These snapshots do not auto-restore. Use them to diff against current
              configuration or export as JSON for manual restoration via migrations.
              Full database restores are handled by Lovable Cloud infrastructure.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Snapshot history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : !snapshots.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No snapshots yet. Capture one before making major configuration changes.
            </p>
          ) : (
            <ScrollArea className="max-h-[480px]">
              <div className="space-y-2 pr-3">
                {snapshots.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50"
                  >
                    <Camera className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{s.label}</span>
                        <Badge variant="outline" className="text-xs">{s.kind}</Badge>
                        <Badge variant="outline" className="text-xs">{formatBytes(s.size_bytes)}</Badge>
                      </div>
                      {s.notes && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">{s.notes}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.created_by_email ?? "—"} ·{" "}
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openDiff(s)} title="Diff vs current">
                        <Diff className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => exportSnapshot(s)} title="Export JSON">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirmDelete(s)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capture configuration snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Label *</label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Before pricing overhaul"
                maxLength={120}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes (optional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why are you capturing this?"
                rows={3}
                maxLength={500}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Captures: {CAPTURED_TABLES.join(", ")}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Capturing…" : "Capture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff dialog */}
      <Dialog open={!!diffOf} onOpenChange={(o) => !o && setDiffOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diff: {diffOf?.label}</DialogTitle>
          </DialogHeader>
          {!diffData ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Computing…</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(diffData).map(([table, c]) => {
                const delta = c.current - c.snapshot;
                return (
                  <div
                    key={table}
                    className="flex items-center justify-between p-2 rounded-md border border-border bg-card/40"
                  >
                    <span className="text-sm font-mono">{table}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{c.snapshot}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{c.current}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          delta === 0
                            ? ""
                            : delta > 0
                            ? "text-green-600 border-green-300"
                            : "text-destructive border-destructive/40"
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffOf(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete snapshot?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes <span className="font-medium">{confirmDelete?.label}</span>.
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete} disabled={remove.isPending}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
