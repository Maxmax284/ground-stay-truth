import { BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const PDF_URL = "/guest-payment-instructions.pdf";

interface Props {
  /** Compact mode shows a single text link; default shows preview + download. */
  variant?: "default" | "compact";
  className?: string;
}

/**
 * Link to the static, branded "LMT CampStay Guest Payment Instructions" PDF.
 * Opens a new tab for preview; download attribute hints the browser to save.
 */
export function PaymentGuideLink({ variant = "default", className }: Props) {
  if (variant === "compact") {
    return (
      <a
        href={PDF_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-xs text-primary hover:underline ${className ?? ""}`}
      >
        <BookOpen className="h-3.5 w-3.5" />
        Payment guide (PDF)
      </a>
    );
  }

  return (
    <div className={`rounded-md border border-border bg-muted/30 p-3 flex items-center justify-between gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">Guest Payment Instructions</p>
          <p className="text-[11px] text-muted-foreground truncate">A simple guide to deposits, balances & secure payment.</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
          <a href={PDF_URL} target="_blank" rel="noopener noreferrer">Preview</a>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-8 text-xs gap-1">
          <a href={PDF_URL} download="LMT-CampStay-Guest-Payment-Instructions.pdf">
            <Download className="h-3.5 w-3.5" />
            PDF
          </a>
        </Button>
      </div>
    </div>
  );
}
