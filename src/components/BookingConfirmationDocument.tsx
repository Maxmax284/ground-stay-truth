import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, Copy, Loader2, FileText, Check } from "lucide-react";
import { toast } from "sonner";

interface BookingConfirmationDocumentProps {
  bookingId: string;
  bookingState: string;
  /** Compact = single button for guest cards. Full = staff row with copy. */
  variant?: "compact" | "full";
}

/**
 * Downloadable Booking Confirmation PDF.
 *
 * Guest-facing: proves accommodation is booked (for immigration, airlines,
 * employer, etc.). Distinct from a Stripe receipt.
 *
 * Only enabled once the booking has reached `confirmed`. Regenerates on
 * demand — every click issues a fresh signed URL (1 hour).
 */
export function BookingConfirmationDocument({
  bookingId,
  bookingState,
  variant = "compact",
}: BookingConfirmationDocumentProps) {
  const [loading, setLoading] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const eligible = ["confirmed", "checked_in", "completed"].includes(bookingState);
  if (!eligible) return null;

  const generate = async (): Promise<string | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-booking-confirmation",
        { body: { booking_id: bookingId } }
      );
      if (error) throw error;
      const url = (data as any)?.signed_url as string | null;
      if (!url) throw new Error("No signed URL returned");
      setLastUrl(url);
      return url;
    } catch (e: any) {
      console.error("generate-booking-confirmation failed", e);
      toast.error(e?.message || "Could not generate confirmation PDF");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const url = lastUrl || (await generate());
    if (url) window.open(url, "_blank", "noopener");
  };

  const handleCopy = async () => {
    const url = lastUrl || (await generate());
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Confirmation link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — long-press to copy manually");
    }
  };

  if (variant === "compact") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={loading}
        className="gap-1.5"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        Download Booking Confirmation
      </Button>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Booking Confirmation Document</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        A downloadable PDF the guest can show for immigration, airlines, or their employer.
        This is <em>not</em> a Stripe receipt — it proves the accommodation is booked.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="default" onClick={handleDownload} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          Download
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopy} disabled={loading}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
          Copy link
        </Button>
      </div>
      {lastUrl && (
        <p className="text-[10px] text-muted-foreground">Link expires in 1 hour. Generate again anytime.</p>
      )}
    </div>
  );
}
