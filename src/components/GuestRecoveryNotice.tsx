import { AlertTriangle, ExternalLink, RefreshCw, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GuestRecoveryNoticeProps {
  /** Short plain-English explanation of what didn't happen. */
  message: string;
  /** Optional URL the guest can open manually when an automatic redirect never fired. */
  link?: string | null;
  linkLabel?: string;
  /** Optional retry handler (re-run the action that stalled). */
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
}

/**
 * Visible recovery path shown when an expected redirect or refresh never
 * arrives. Guests must always be given something to tap instead of a
 * silently stalled screen.
 */
export function GuestRecoveryNotice({
  message,
  link,
  linkLabel = "Open secure checkout",
  onRetry,
  retryLabel = "Try again",
  onDismiss,
}: GuestRecoveryNoticeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — long-press the link instead");
    }
  };

  return (
    <div className="rounded-md border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2 text-left">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <p className="text-xs text-foreground">{message}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {link && (
          <>
            <Button asChild size="sm" variant="default" className="gap-1.5">
              <a href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {linkLabel}
              </a>
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy link
            </Button>
          </>
        )}
        {onRetry && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        )}
        {onDismiss && (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Still stuck? Contact the front desk and we'll send you a direct payment link.
      </p>
    </div>
  );
}
