/**
 * OpsConsole — the operator's control room.
 *
 * Promoted out of Settings because this is not a settings screen: it is where a
 * shift lead reads the camp, asks the assistant deep operational questions,
 * reviews proposed actions, and lends or borrows time-boxed admin authority.
 *
 * Everything dangerous stays behind the ops security code and the
 * Plan -> Approve -> Execute law. Nothing here executes straight from chat.
 */
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AIOpsPanel } from "@/components/admin/AIOpsPanel";
import { Gauge, KeyRound, MessageSquare, ShieldCheck } from "lucide-react";

const CAPABILITIES = [
  {
    icon: MessageSquare,
    title: "Ask, don't dig",
    detail:
      "Deep ops reads today's board, any booking, guest history, free rooms, housekeeping, money owed, exceptions and recent overrides. Thai or English, typed or spoken.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing moves without a signature",
    detail:
      "The assistant can only write a draft. A human approves or rejects it, and the decision is attributed in the audit log.",
  },
  {
    icon: KeyRound,
    title: "Borrowed authority, visibly",
    detail:
      "Break-glass lends admin power for up to 15 minutes. While it is live the whole app shows a warning bar, a countdown, and a key marker on every borrowed control.",
  },
  {
    icon: Gauge,
    title: "Practice before live",
    detail:
      "Flip to the sandbox camp and rehearse the whole loop. No emails, no charges, no alerts, no live inventory touched.",
  },
];

export default function OpsConsole() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ops Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational intelligence, approvals and temporary authority — in one place.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
            <Card key={title} className="transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{detail}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        <ErrorBoundary inline label="Ops Console">
          <AIOpsPanel />
        </ErrorBoundary>
      </div>
    </DashboardLayout>
  );
}
