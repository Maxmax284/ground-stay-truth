/**
 * SandboxModeBanner — loud, permanent reminder that the active property is the
 * fake practice camp. Sandbox stays cannot email guests, alert staff, or create
 * Stripe payment links.
 */
import { FlaskConical } from "lucide-react";
import { useProperty } from "@/hooks/useProperty";

export function SandboxModeBanner() {
  const { activeProperty } = useProperty();
  if (!activeProperty?.is_sandbox) return null;

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-2 text-sm font-medium">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>
        Sandbox camp — practice data only. No guest emails, alerts or payment links will be sent.
      </span>
    </div>
  );
}
