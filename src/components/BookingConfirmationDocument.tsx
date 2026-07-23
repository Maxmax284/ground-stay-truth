import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  Download,
  Copy,
  Loader2,
  FileText,
  Check,
  FileWarning,
  Languages,
  Eye,
  ExternalLink,
} from "lucide-react";
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
 * Every action issues a fresh signed URL (1 hour). Guests can preview the PDF
 * inline before downloading, and staff can preview a watermarked pending
 * summary for bookings that aren't yet confirmed.
 */
export function BookingConfirmationDocument({
  bookingId,
  bookingState,
  variant = "compact",
  allowPending = false,
  preferredLanguage = null,
}: BookingConfirmationDocumentProps) {
  const [loading, setLoading] = useState<false | "confirmed" | "pending" | "preview">(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const defaultLang = useMemo(() => {
    const raw = (preferredLanguage || "en").toLowerCase().slice(0, 2);
    return SUPPORTED_CODES.has(raw) ? raw : "en";
  }, [preferredLanguage]);
  const [language, setLanguage] = useState<string>(defaultLang);

  const confirmed = ["confirmed", "checked_in", "completed"].includes(bookingState);
  const pendingOk = ["inquiry", "soft_hold", "pending_approval", "pending_deposit"].includes(bookingState);
  const canPending = allowPending && pendingOk;

  if (!confirmed && !canPending) return null;

  const generate = async (
    mode: "confirmed" | "pending",
    loadingState: "confirmed" | "pending" | "preview" = mode,
  ): Promise<string | null> => {
    setLoading(loadingState);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-booking-confirmation",
        { body: { booking_id: bookingId, mode, language } },
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

  const handlePreview = async () => {
    const url = await generate("confirmed", "preview");
    if (url) {
      setPreviewUrl(url);
      setPreviewOpen(true);
    }
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

  const LanguageSelect = (
    <Select value={language} onValueChange={setLanguage} disabled={!!loading}>
      <SelectTrigger
        className="h-9 w-full sm:w-auto gap-1.5 px-3 text-xs min-w-[7.5rem]"
        aria-label="PDF language"
      >
        <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {PDF_LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code} className="text-xs">
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const PreviewDialog = (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b flex-row items-center justify-between gap-2 space-y-0">
          <DialogTitle className="text-sm sm:text-base">Booking Confirmation Preview</DialogTitle>
          {previewUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(previewUrl, "_blank", "noopener")}
              className="gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Button>
          )}
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="Booking confirmation preview"
              className="w-full h-full border-0"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (variant === "compact") {
    if (!confirmed) return null;
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            disabled={!!loading}
            className="gap-1.5"
          >
            {loading === "preview" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            Preview
          </Button>
          <div className="w-full sm:w-auto">{LanguageSelect}</div>
        </div>
        {PreviewDialog}
      </>
    );
  }

  return (
    <>
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Booking Confirmation Document</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          A downloadable PDF the guest can show for immigration, airlines, or their employer.
          This is <em>not</em> a Stripe receipt — it proves the accommodation is booked.
        </p>
        <div className="flex gap-2 flex-wrap items-center">
          {confirmed && (
            <>
              <Button size="sm" variant="default" onClick={handleDownload} disabled={!!loading}>
                {loading === "confirmed" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                Download
              </Button>
              <Button size="sm" variant="outline" onClick={handlePreview} disabled={!!loading}>
                {loading === "preview" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                )}
                Preview
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopy} disabled={!!loading}>
                {copied ? (
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                Copy link
              </Button>
            </>
          )}
          {canPending && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePreviewPending}
              disabled={!!loading}
              className="text-amber-700"
            >
              {loading === "pending" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <FileWarning className="h-3.5 w-3.5 mr-1.5" />
              )}
              Preview pending summary
            </Button>
          )}
          <div className="w-full sm:w-auto sm:ml-auto">{LanguageSelect}</div>
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
      {PreviewDialog}
    </>
  );
}
