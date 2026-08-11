/**
 * AIDraftsPanel — the human side of the deep-ops agent.
 *
 * Every proposal the AI makes lands here as a draft. Staff with ops-write can
 * approve or reject with a note; nothing runs automatically. Approving marks
 * the plan as accepted and stamps the override audit log with who accepted it.
 */
import { useState } from "react";
import { Bot, Check, X, Clock, ClipboardList, Zap } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAIDrafts, aiDraftActionLabel, type AIDraft, type AIDraftStatus } from "@/hooks/useAIDrafts";
import { formatCampDateTime } from "@/lib/timezone";
import { planDraftExecution } from "@/lib/aiDraftExecutors";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  applied: "bg-primary/15 text-primary border-primary/30",
  expired: "bg-muted text-muted-foreground border-border",
};

function DraftRow({
  draft,
  onReview,
  busy,
}: {
  draft: AIDraft;
  onReview: (
    decision: "approved" | "rejected" | "applied",
    note: string,
    execute?: boolean,
  ) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const details = draft.payload && Object.keys(draft.payload).length > 0 ? draft.payload : null;
  const plan = planDraftExecution(draft);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3 transition-transform duration-300 hover:-translate-y-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{aiDraftActionLabel(draft.action_type)}</Badge>
            <Badge variant="outline" className={`text-xs ${STATUS_TONE[draft.status] ?? ""}`}>
              {draft.status}
            </Badge>
            {plan.ok && draft.status === "pending" && (
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Applies on approve
              </Badge>
            )}
          </div>

          <p className="font-medium text-sm text-foreground break-words">{draft.summary}</p>
          {draft.rationale && (
            <p className="text-xs text-muted-foreground break-words">{draft.rationale}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatCampDateTime(draft.created_at)}
        </span>
      </div>

      {details && (
        <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}

      {draft.status === "pending" ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the audit trail"
            rows={2}
            className="text-sm"
          />
          {plan.ok && (
            <p className="text-xs text-primary">
              Approving applies this automatically — {plan.describe}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => onReview("approved", note, plan.ok)}>
              {plan.ok ? (
                <>
                  <Zap className="h-4 w-4 mr-1" /> Approve &amp; apply
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" /> Approve plan
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onReview("applied", note)}
            >
              Mark done
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => onReview("rejected", note)}
            >
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        </div>
      ) : (
        draft.review_note && (
          <p className="text-xs text-muted-foreground">Note: {draft.review_note}</p>
        )
      )}
    </div>
  );
}

export function AIDraftsPanel() {
  const [filter, setFilter] = useState<AIDraftStatus | "all">("pending");
  const { drafts, pendingCount, review, isReviewing } = useAIDrafts(filter);

  const handleReview = async (
    draft: AIDraft,
    decision: "approved" | "rejected" | "applied",
    note: string,
    execute?: boolean,
  ) => {
    try {
      const result = await review({ draft, decision, note, execute });
      toast.success(
        result?.executed
          ? `Applied — ${result.describe}`
          : decision === "rejected"
            ? "Draft rejected"
            : decision === "applied"
              ? "Marked done"
              : "Plan approved",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the decision");
    }
  };

  const rows = drafts.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI action drafts
          {pendingCount > 0 && <Badge variant="secondary">{pendingCount} waiting</Badge>}
        </CardTitle>
        <CardDescription>
          Everything the deep-ops assistant proposes lands here. Nothing executes on its own —
          you approve, then carry it out with the normal tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as AIDraftStatus | "all")}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="pending" className="text-xs">Waiting</TabsTrigger>
            <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
            <TabsTrigger value="applied" className="text-xs">Done</TabsTrigger>
            <TabsTrigger value="rejected" className="text-xs">Rejected</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {drafts.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading drafts…</p>
        ) : drafts.isError ? (
          <p className="text-sm text-destructive">Could not load drafts. Refresh and try again.</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nothing here. Ask the assistant in Deep ops mode to plan something.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                busy={isReviewing}
                onReview={(decision, note) => handleReview(d, decision, note)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AIDraftsPanel;
