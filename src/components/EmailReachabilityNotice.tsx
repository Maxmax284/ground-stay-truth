import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MailWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Staff-only warning when a guest's email can't receive our messages:
 * no address on file, or it bounced / complained / unsubscribed.
 * Read-only — it never blocks or changes a send.
 */
export function EmailReachabilityNotice({ email }: { email: string | null }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["email-deliverability", email?.toLowerCase()],
    enabled: !!email,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_deliverability", { _email: email! });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });

  let text: string | null = null;
  if (!email) {
    text = t("emailReach.none", "No email on file — this guest gets no booking emails or reply alerts. Chase by phone or WhatsApp.");
  } else if (data) {
    const why =
      data.reason === "bounce"
        ? t("emailReach.bounce", "bounced")
        : data.reason === "complaint"
          ? t("emailReach.complaint", "was marked as spam")
          : t("emailReach.unsub", "unsubscribed");
    text = t("emailReach.blocked", "Emails to {{email}} {{why}} — they won't get our emails or reply alerts. Get a working address or chase another way.", { email, why });
  }
  if (!text) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <MailWarning className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
