import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Download, Copy, Loader2, FileText, Check, FileWarning, Languages } from "lucide-react";
import { toast } from "sonner";

interface BookingConfirmationDocumentProps {
  bookingId: string;
  bookingState: string;
  /** Compact = single button for guest cards. Full = staff row with copy + pending preview. */
  variant?: "compact" | "full";
  /** Allow staff to preview a pending-summary PDF before the booking is confirmed. */
  allowPending?: boolean;
  /** Preferred language for PDF labels (e.g. from the guest's profile). Defaults to "en". */
  preferredLanguage?: string | null;
}

/** PDF label languages the generator actually renders. Others fall back to English labels. */
const PDF_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский (EN labels)" },
];
const SUPPORTED_CODES = new Set(PDF_LANGUAGES.map((l) => l.code));


/**
 * Downloadable Booking Confirmation PDF.
 *
 * Guest-facing: proves accommodation is booked (for immigration, airlines,
 * employer, etc.). Distinct from a Stripe receipt.
 *
 * Once confirmed, every click issues a fresh signed URL (1 hour). Staff can
 * also generate a "pending summary" PDF for bookings not yet confirmed —
 * clearly watermarked so it is never confused with the real document.
 */
export function BookingConfirmationDocument({
  bookingId,
  bookingState,
  variant = "compact",
  allowPending = false,
  preferredLanguage = null,
}: BookingConfirmationDocumentProps) {
  const [loading, setLoading] = useState<false | "confirmed" | "pending">(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const defaultLang = useMemo(() => {
    const raw = (preferredLanguage || "en").toLowerCase().slice(0, 2);
    return SUPPORTED_CODES.has(raw) ? raw : "en";
  }, [preferredLanguage]);
  const [language, setLanguage] = useState<string>(defaultLang);

  const confirmed = ["confirmed", "checked_in", "completed"].includes(bookingState);
  const pendingOk = ["inquiry", "soft_hold", "pending_approval", "pending_deposit"].includes(bookingState);
  const canPending = allowPending && pendingOk;

  if (!confirmed && !canPending) return null;

  const generate = async (mode: "confirmed" | "pending"): Promise<string | null> => {
    setLoading(mode);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-booking-confirmation",
        { body: { booking_id: bookingId, mode, language } }
      );
      if (error) throw error;
      const url = (data as any)?.signed_url as string | null;
      if (!url) throw new Error("No signed URL returned");
      if (mode === "confirmed") setLastUrl(url);
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
    // A fresh language selection invalidates the cached URL — regenerate.
    const url = await generate("confirmed");
    if (url) window.open(url, "_blank", "noopener");
  };


  const handlePreviewPending = async () => {
    const url = await generate("pending");
    if (url) window.open(url, "_blank", "noopener");
  };

  const handleCopy = async () => {
    const url = lastUrl || (await generate("confirmed"));
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
    if (!confirmed) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={!!loading}
        className="gap-1.5"
      >
        {loading === "confirmed" ? (
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
        {confirmed && (
          <>
            <Button size="sm" variant="default" onClick={handleDownload} disabled={!!loading}>
              {loading === "confirmed" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Download
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopy} disabled={!!loading}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
              Copy link
            </Button>
          </>
        )}
        {canPending && (
          <Button size="sm" variant="ghost" onClick={handlePreviewPending} disabled={!!loading} className="text-amber-700">
            {loading === "pending" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileWarning className="h-3.5 w-3.5 mr-1.5" />}
            Preview pending summary
          </Button>
        )}
      </div>
      {canPending && !confirmed && (
        <p className="text-[10px] text-amber-700">
          Pending preview is clearly watermarked "NOT CONFIRMED". Do not send to the guest as a real confirmation.
        </p>
      )}
      {lastUrl && (
        <p className="text-[10px] text-muted-foreground">Link expires in 1 hour. Generate again anytime.</p>
      )}
    </div>
  );
}
