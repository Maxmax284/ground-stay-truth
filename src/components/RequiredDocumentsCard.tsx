/**
 * Required Documents Card
 *
 * Per-booking checklist showing which documents are tracked (Passport/ID + TM30
 * for long stays). Each entry is advisory — never blocks check-in or any action.
 *
 * Reuses GuestDocumentUpload with a documentType filter so each row manages
 * its own list and upload independently.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Info } from "lucide-react";
import { GuestDocumentUpload } from "@/components/GuestDocumentUpload";
import { Tm30ConfirmRow } from "@/components/Tm30ConfirmRow";
import {
  getRequiredDocsForBooking,
  nightsBetween,
  TM30_LONG_STAY_THRESHOLD_NIGHTS,
} from "@/lib/requiredDocuments";

interface Props {
  bookingId: string;
  checkIn: string;
  checkOut: string;
}

export function RequiredDocumentsCard({ bookingId, checkIn, checkOut }: Props) {
  const docs = getRequiredDocsForBooking({ checkIn: checkIn, checkOut });
  const nights = nightsBetween(checkIn, checkOut);
  const isLongStay = nights >= TM30_LONG_STAY_THRESHOLD_NIGHTS;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Documents Checklist
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use for check-in identity review and TM30 registration. Advisory only —
            nothing here blocks check-in.
          </p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {nights} night{nights === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="space-y-3">
        {docs.map((d) => (
          <Card key={d.type} className="bg-muted/30 border-dashed">
            <CardContent className="p-3 space-y-2">
              {d.type === "tm30" ? (
                <Tm30ConfirmRow
                  bookingId={bookingId}
                  label={d.label}
                  subtitle={d.description}
                />
              ) : (
                <GuestDocumentUpload
                  bookingId={bookingId}
                  documentType={d.type}
                  title={d.label}
                  subtitle={d.description}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {nights === 0 && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground border border-dashed rounded-md p-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Same-day stays do not trigger TM30 tracking.</span>
        </div>
      )}
    </div>
  );
}

