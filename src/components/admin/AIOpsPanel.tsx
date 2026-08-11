/**
 * AIOpsPanel — the admin's single setup surface for the AI ops layer.
 *
 * Three things live here:
 *  1. Readiness checklist — what is configured and what still needs a decision.
 *  2. Break-glass elevation console (time-boxed admin authority).
 *  3. The AI action draft queue (Plan -> Approve -> Execute).
 *
 * Admins can rehearse the whole flow against the sandbox property, so nothing
 * they test touches live inventory, guests, money or email.
 */
import { CheckCircle2, CircleDashed, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ElevationPanel } from "@/components/admin/ElevationPanel";
import { AIDraftsPanel } from "@/components/admin/AIDraftsPanel";
import { useAIDrafts } from "@/hooks/useAIDrafts";
import { useElevationGrants } from "@/hooks/useAdminElevation";

function ChecklistRow({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
      ) : (
        <CircleDashed className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function AIOpsPanel() {
  const { drafts, pendingCount } = useAIDrafts("all", 1);
  const { grants } = useElevationGrants();

  const hasDrafts = (drafts.data?.length ?? 0) > 0;
  const hasUsedElevation = (grants.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI ops setup
            {pendingCount > 0 && <Badge variant="secondary">{pendingCount} drafts waiting</Badge>}
          </CardTitle>
          <CardDescription>
            Everything the AI layer needs is configured here. Rehearse it on the sandbox property
            first — sandbox bookings never send email, never charge, never touch live inventory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ChecklistRow
            done
            label="Deep ops assistant is live"
            detail="Open the assistant bubble and switch the mode chip to Deep ops. Staff only — guests keep the scoped concierge."
          />
          <ChecklistRow
            done
            label="Write safety is enforced server-side"
            detail="The agent has exactly one write tool and it can only create a draft. No booking, payment or inventory change can start from chat."
          />
          <ChecklistRow
            done={hasDrafts}
            label="Try the approval loop"
            detail="Ask Deep ops to plan something (e.g. 'draft a payment request for booking X'), then approve or reject it below."
          />
          <ChecklistRow
            done={hasUsedElevation}
            label="Break-glass window tested"
            detail="Self-elevate for a few minutes, or lend admin authority to a staff member. Max 15 minutes, reason required, every action tagged in the audit log."
          />
          <ChecklistRow
            done
            label="Audit trail wired"
            detail="Approvals, rejections and elevated actions all land in Monitoring Center → Overrides with the real person's name."
          />
        </CardContent>
      </Card>

      <ElevationPanel />
      <AIDraftsPanel />
    </div>
  );
}

export default AIOpsPanel;
