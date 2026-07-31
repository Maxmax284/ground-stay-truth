/**
 * Staff Document Review — the front-desk "document vault" view.
 *
 * Identity documents are sensitive legal documents, not ordinary attachments.
 * This component gives authorized staff a controlled way to:
 *   - see the latest uploaded ID/passport for a booking
 *   - open or download it through a SHORT-LIVED signed URL (never a public link)
 *   - mark it Reviewed / Accepted / Needs replacement with a plain-English reason
 *   - flag "Details copied for TM30"
 *   - see previous uploads as version history
 *
 * Every view, download, and review action writes an audit row via the hooks in
 * useGuestDocuments. Raw storage paths and signed URLs are never displayed.
 */
import { useState } from "react";
import { format } from "date-fns";
import {
  Eye,
  Download,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  History,
  FileText,
  Stamp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

import {
  type GuestDocument,
  type DocumentReviewStatus,
  REVIEW_STATUS_LABELS,
  REPLACEMENT_REASONS,
  useOpenGuestDocument,
  useReviewGuestDocument,
  useMarkDocumentTm30,
} from "@/hooks/useGuestDocuments";

function StatusBadge({ status }: { status: DocumentReviewStatus }) {
  const label = REVIEW_STATUS_LABELS[status] ?? status;
  switch (status) {
    case "accepted":
      return (
        <Badge className="text-xs bg-success/20 text-[hsl(var(--success))] border-0">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {label}
        </Badge>
      );
    case "reviewed":
      return <Badge variant="secondary" className="text-xs">{label}</Badge>;
    case "needs_replacement":
      return (
        <Badge variant="destructive" className="text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {label}
        </Badge>
      );
    case "superseded":
      return <Badge variant="outline" className="text-xs text-muted-foreground">{label}</Badge>;
    default:
      return (
        <Badge variant="outline" className="text-xs border-amber-400 text-amber-600">
          {label}
        </Badge>
      );
  }
}

function DocumentActions({ doc, compact }: { doc: GuestDocument; compact?: boolean }) {
  const { toast } = useToast();
  const open = useOpenGuestDocument();
  const review = useReviewGuestDocument();
  const tm30 = useMarkDocumentTm30();
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPLACEMENT_REASONS[0]);
  const [note, setNote] = useState("");

  const handleOpen = async (action: "view" | "download") => {
    try {
      const url = await open.mutateAsync({ doc, action });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({
        title: "Could not open document",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const setStatus = async (status: DocumentReviewStatus) => {
    try {
      await review.mutateAsync({ doc, status });
      toast({ title: `Marked ${REVIEW_STATUS_LABELS[status].toLowerCase()}` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 min-w-[120px]"
          disabled={open.isPending}
          onClick={() => handleOpen("view")}
        >
          {open.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          View
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 min-w-[120px]"
          disabled={open.isPending}
          onClick={() => handleOpen("download")}
        >
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>

      {!compact && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 min-w-[120px]"
              disabled={review.isPending}
              onClick={() => setStatus("reviewed")}
            >
              Mark reviewed
            </Button>
            <Button
              size="sm"
              className="flex-1 min-w-[120px]"
              disabled={review.isPending}
              onClick={() => setStatus("accepted")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-[150px]"
              disabled={review.isPending}
              onClick={() => setReplaceOpen(true)}
            >
              Needs replacement
            </Button>
          </div>

          <Button
            size="sm"
            variant={doc.used_for_tm30 ? "secondary" : "ghost"}
            className="w-full justify-start"
            disabled={tm30.isPending}
            onClick={() => tm30.mutate({ doc, used: !doc.used_for_tm30 })}
          >
            <Stamp className="h-4 w-4 mr-2" />
            {doc.used_for_tm30
              ? `Details copied for TM30${doc.tm30_marked_at ? ` · ${format(new Date(doc.tm30_marked_at), "MMM d")}` : ""}`
              : "Mark details copied for TM30"}
          </Button>
        </>
      )}

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a replacement</DialogTitle>
            <DialogDescription>
              Pick the reason so the front desk knows what to ask the guest for.
              This does not email the guest.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {REPLACEMENT_REASONS.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={reason === r ? "default" : "outline"}
                onClick={() => setReason(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <Textarea
            placeholder="Optional internal note (staff only)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplaceOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={review.isPending}
              onClick={async () => {
                try {
                  await review.mutateAsync({
                    doc,
                    status: "needs_replacement",
                    reason,
                    note: note.trim() || null,
                  });
                  setReplaceOpen(false);
                  setNote("");
                  toast({ title: "Marked needs replacement" });
                } catch (err: any) {
                  toast({ title: "Error", description: err?.message, variant: "destructive" });
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StaffDocumentReview({ documents }: { documents: GuestDocument[] }) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No document on file yet for this booking.
      </p>
    );
  }

  const [latest, ...previous] = documents; // already sorted newest first

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2 truncate">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{latest.file_name}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Latest uploaded {format(new Date(latest.created_at), "MMM d, yyyy 'at' p")}
            </p>
            {latest.review_status === "needs_replacement" && latest.review_reason && (
              <p className="text-xs text-destructive mt-0.5">
                Reason: {latest.review_reason}
                {latest.review_note ? ` — ${latest.review_note}` : ""}
              </p>
            )}
            {latest.reviewed_at && latest.review_status !== "uploaded" && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last action {format(new Date(latest.reviewed_at), "MMM d, yyyy 'at' p")}
              </p>
            )}
          </div>
          <StatusBadge status={latest.review_status ?? "uploaded"} />
        </div>

        <DocumentActions doc={latest} />
      </div>

      <div className="flex items-start gap-1.5 text-xs text-muted-foreground border border-dashed rounded-md p-2">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Use for check-in identity review and TM30 registration only. Authorized
          staff only — every view and download is logged.
        </span>
      </div>

      {previous.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
              <History className="h-3.5 w-3.5 mr-2" />
              {previous.length} previous upload{previous.length === 1 ? "" : "s"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {previous.map((doc) => (
              <div key={doc.id} className="rounded-md border border-dashed p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate">{doc.file_name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(doc.created_at), "MMM d")}
                  </span>
                </div>
                <DocumentActions doc={doc} compact />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
