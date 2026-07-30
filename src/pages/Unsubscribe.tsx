import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, MailX } from "lucide-react";

type State = "checking" | "valid" | "invalid" | "already" | "done" | "error";

/**
 * One-click unsubscribe landing page. The link in every app email points here
 * with a single-use token. GET validates, POST completes the opt-out.
 */
const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("checking");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return setState("invalid");
        if (body?.reason === "already_unsubscribed") return setState("already");
        setState(body?.valid ? "valid" : "invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    setSubmitting(false);
    if (error) return setState("error");
    if ((data as any)?.reason === "already_unsubscribed") return setState("already");
    setState("done");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
            LMT CampStay
          </div>
          <CardTitle className="flex items-center gap-2 text-xl">
            {state === "done" || state === "already" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : state === "invalid" || state === "error" ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <MailX className="h-5 w-5 text-muted-foreground" />
            )}
            {state === "done"
              ? "You're unsubscribed"
              : state === "already"
                ? "Already unsubscribed"
                : state === "invalid"
                  ? "Link not valid"
                  : state === "error"
                    ? "Something went wrong"
                    : "Unsubscribe"}
          </CardTitle>
          <CardDescription>
            {state === "checking" && "Checking your link…"}
            {state === "valid" &&
              "Confirm below and we'll stop sending you email from LMT CampStay."}
            {state === "done" &&
              "You won't receive further email from us at this address."}
            {state === "already" && "This address is already opted out. Nothing more to do."}
            {state === "invalid" &&
              "This unsubscribe link is missing, expired, or already used."}
            {state === "error" && "We couldn't process that just now. Try the link again shortly."}
          </CardDescription>
        </CardHeader>
        {state === "valid" && (
          <CardContent>
            <Button onClick={confirm} disabled={submitting} className="w-full">
              {submitting ? "Working…" : "Confirm unsubscribe"}
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
};

export default Unsubscribe;
