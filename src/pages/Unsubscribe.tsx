import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MailX } from "lucide-react";

/**
 * Legacy unsubscribe landing page. Email opt-outs are now handled on the
 * hosted unsubscribe page linked in the footer of every app email, so this
 * route only exists to explain that to anyone following an old link.
 */
const Unsubscribe = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
            LMT CampStay
          </div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MailX className="h-5 w-5 text-muted-foreground" />
            Email preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Unsubscribe links now live at the bottom of every email we send. Open the most
            recent email from us and use the unsubscribe link in its footer.
          </p>
          <p>
            Booking, payment and account emails you need for an active stay will still reach
            you.
          </p>
        </CardContent>
      </Card>
    </main>
  );
};

export default Unsubscribe;
