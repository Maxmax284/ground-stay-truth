import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import {
  useEarlyCheckinRequest,
  useCreateEarlyCheckinRequest,
  useResolveEarlyCheckinRequest,
} from "@/hooks/useEarlyCheckin";
import { AlertTriangle, Clock, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";

interface EarlyCheckinApprovalProps {
  bookingId: string;
  hoursShort: number;
  isViolated: boolean;
}

export function EarlyCheckinApproval({ bookingId, hoursShort, isViolated }: EarlyCheckinApprovalProps) {
  const { toast } = useToast();
  const { role } = useAuth();
  const { data: existingRequest, isLoading } = useEarlyCheckinRequest(bookingId);
  const createRequest = useCreateEarlyCheckinRequest();
  const resolveRequest = useResolveEarlyCheckinRequest();

  const [escalationReason, setEscalationReason] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [showEscalate, setShowEscalate] = useState(false);

  const canApprove = permissions.canApproveOverride(role);

  if (!isViolated || isLoading) return null;

  // Already has an approved request — check-in can proceed
  if (existingRequest?.status === "approved") {
    return (
      <div className="flex items-center gap-2 text-sm bg-success/10 text-[hsl(var(--success))] rounded-md p-3">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Early check-in approved</p>
          {existingRequest.response_note && (
            <p className="text-xs mt-0.5 opacity-80">{existingRequest.response_note}</p>
          )}
        </div>
      </div>
    );
  }

  // Denied
  if (existingRequest?.status === "denied") {
    return (
      <div className="flex items-center gap-2 text-sm bg-destructive/10 text-destructive rounded-md p-3">
        <XCircle className="h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Early check-in denied</p>
          {existingRequest.response_note && (
            <p className="text-xs mt-0.5">{existingRequest.response_note}</p>
          )}
          <p className="text-xs mt-1 text-muted-foreground">
            Check-in cannot proceed until the cleaning buffer is satisfied.
          </p>
        </div>
      </div>
    );
  }

  // Pending request exists
  if (existingRequest?.status === "pending") {
    return (
      <div className="space-y-3 rounded-md border border-warning/30 bg-warning/5 p-3">
        <div className="flex items-center gap-2 text-sm text-warning-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Early check-in escalated — awaiting Manager approval</p>
            <p className="text-xs mt-0.5 text-muted-foreground">
              Buffer violation: {hoursShort}h short of required cleaning time.
            </p>
          </div>
        </div>

        {/* Manager approval controls */}
        {canApprove && (
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs font-medium">Manager Response</Label>
            <Textarea
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              placeholder="Optional response note…"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={async () => {
                  try {
                    await resolveRequest.mutateAsync({
                      requestId: existingRequest.id,
                      bookingId,
                      status: "approved",
                      responseNote: responseNote || undefined,
                    });
                    toast({ title: "Early check-in approved" });
                    setResponseNote("");
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  }
                }}
                disabled={resolveRequest.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                onClick={async () => {
                  try {
                    await resolveRequest.mutateAsync({
                      requestId: existingRequest.id,
                      bookingId,
                      status: "denied",
                      responseNote: responseNote || undefined,
                    });
                    toast({ title: "Early check-in denied" });
                    setResponseNote("");
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  }
                }}
                disabled={resolveRequest.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Deny
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // No request yet — show warning and escalation form
  return (
    <div className="space-y-3 rounded-md border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start gap-2 text-sm text-warning-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Cleaning buffer violation</p>
          <p className="text-xs mt-0.5 text-muted-foreground">
            This check-in is {hoursShort}h short of the required cleaning buffer.
            Manager approval is required to proceed with early check-in.
          </p>
        </div>
      </div>

      {!showEscalate ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setShowEscalate(true)}
        >
          <ArrowUpRight className="h-4 w-4 mr-1" />
          Request Manager Approval
        </Button>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Reason for early check-in *</Label>
          <Textarea
            value={escalationReason}
            onChange={(e) => setEscalationReason(e.target.value)}
            placeholder="Explain why early check-in is needed…"
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={async () => {
                if (!escalationReason.trim()) {
                  toast({ title: "Reason required", variant: "destructive" });
                  return;
                }
                try {
                  await createRequest.mutateAsync({
                    bookingId,
                    reason: escalationReason.trim(),
                    bufferViolationHours: hoursShort,
                  });
                  toast({ title: "Escalation sent", description: "A Manager will review this request." });
                  setEscalationReason("");
                  setShowEscalate(false);
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                }
              }}
              disabled={createRequest.isPending || !escalationReason.trim()}
            >
              {createRequest.isPending ? "Sending…" : "Send Escalation"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowEscalate(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
