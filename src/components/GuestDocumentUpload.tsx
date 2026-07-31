import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { logGuestPortalEvent } from "@/lib/guestPortalTelemetry";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GuestRecoveryNotice } from "@/components/GuestRecoveryNotice";
import { useToast } from "@/hooks/use-toast";

import {
  useGuestDocuments,
  useUploadGuestDocument,
  useDeleteGuestDocument,
  type GuestDocument,
  type VerificationNotes,
} from "@/hooks/useGuestDocuments";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { format } from "date-fns";
import {
  Upload,
  FileText,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import type { DocumentType } from "@/lib/requiredDocuments";

interface GuestDocumentUploadProps {
  bookingId: string;
  showRequirement?: boolean;
  /** When set, this instance only shows + uploads documents of this type. */
  documentType?: DocumentType;
  /** Override the displayed heading. */
  title?: string;
  /** Override the descriptive subline below the heading. */
  subtitle?: string;
  /** When true, suppress the heading entirely (used inside a wrapper card). */
  hideHeading?: boolean;
}

function VerificationBadge({
  status,
  isStaff,
}: {
  status: string | null;
  isStaff: boolean;
}) {
  const { t } = useTranslation();

  if (!status) return null;

  switch (status) {
    case "analyzing":
      return (
        <Badge variant="secondary" className="text-xs gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("verification.analyzing")}
        </Badge>
      );
    case "clear":
      return (
        <Badge className="text-xs bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] border-0">
          {isStaff ? t("verification.clear") : t("verification.reviewed")}
        </Badge>
      );
    case "flagged":
      return (
        <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 bg-amber-50">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {isStaff ? t("verification.flagged") : t("verification.reviewed")}
        </Badge>
      );
    case "error":
      return (
        <Badge variant="secondary" className="text-xs text-muted-foreground">
          {t("verification.error")}
        </Badge>
      );
    default:
      return null;
  }
}

function VerificationDetails({ notes }: { notes: VerificationNotes }) {
  const { t } = useTranslation();

  if (notes.error) {
    return <p className="text-xs text-muted-foreground">{notes.error}</p>;
  }

  const docTypeLabels: Record<string, string> = {
    passport: "Passport",
    national_id: "National ID",
    drivers_license: "Driver's License",
    residence_permit: "Residence Permit",
    unknown: "Unknown",
  };

  const confidenceColors: Record<string, string> = {
    high: "text-[hsl(var(--success))]",
    medium: "text-amber-600",
    low: "text-destructive",
  };

  return (
    <div className="space-y-1.5 text-xs pl-6">
      {notes.summary && (
        <p className="text-muted-foreground italic">{notes.summary}</p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {notes.document_type && (
          <>
            <span className="text-muted-foreground">{t("verification.documentType")}</span>
            <span>{docTypeLabels[notes.document_type] ?? notes.document_type}</span>
          </>
        )}
        {notes.issuing_country && (
          <>
            <span className="text-muted-foreground">{t("verification.issuingCountry")}</span>
            <span>{notes.issuing_country}</span>
          </>
        )}
        {notes.expiry_date && (
          <>
            <span className="text-muted-foreground">{t("verification.expiryDate")}</span>
            <span className={notes.is_expired ? "text-destructive font-medium" : ""}>
              {notes.expiry_date}
              {notes.is_expired && ` — ${t("verification.expired")}`}
            </span>
          </>
        )}
        {notes.confidence && (
          <>
            <span className="text-muted-foreground">{t("verification.confidence")}</span>
            <span className={confidenceColors[notes.confidence] ?? ""}>
              {notes.confidence.charAt(0).toUpperCase() + notes.confidence.slice(1)}
            </span>
          </>
        )}
      </div>
      {notes.quality_issues && notes.quality_issues.length > 0 && (
        <div>
          <span className="text-muted-foreground">{t("verification.qualityIssues")}:</span>
          <ul className="list-disc list-inside ml-2">
            {notes.quality_issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  canDelete,
  isStaff,
  onDelete,
  deleteDisabled,
}: {
  doc: GuestDocument;
  canDelete: boolean;
  isStaff: boolean;
  onDelete: (doc: GuestDocument) => void;
  deleteDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasNotes = isStaff && doc.verification_notes && !doc.verification_notes.error;
  const isFlagged = doc.verification_status === "flagged";

  return (
    <div
      className={`border rounded-md ${isFlagged && isStaff ? "border-amber-300 bg-amber-50/50" : ""}`}
    >
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">{doc.file_name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <VerificationBadge status={doc.verification_status} isStaff={isStaff} />
          <span className="text-xs text-muted-foreground">
            {format(new Date(doc.created_at), "MMM d")}
          </span>
          {hasNotes && (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onDelete(doc)}
              disabled={deleteDisabled}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      {hasNotes && open && (
        <div className="px-2 pb-2">
          <VerificationDetails notes={doc.verification_notes!} />
        </div>
      )}
    </div>
  );
}

export function GuestDocumentUpload({
  bookingId,
  showRequirement,
  documentType,
  title,
  subtitle,
  hideHeading,
}: GuestDocumentUploadProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: allDocuments, isLoading, refetch } = useGuestDocuments(bookingId);
  const upload = useUploadGuestDocument();
  const deleteDoc = useDeleteGuestDocument();
  const canUpload = permissions.canUploadDocuments(role);
  const canDelete = permissions.canManageUnits(role);
  const isStaff = permissions.isStaff(role);
  const [stalled, setStalled] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);
  // When a documentType filter is active, only show docs matching that type.
  const documents = documentType
    ? (allDocuments ?? []).filter((d) => (d.document_type ?? "passport") === documentType)
    : allDocuments;
  const hasDocuments = (documents?.length ?? 0) > 0;

  // If an upload never resolves (flaky mobile data, in-app browsers), give the
  // guest a visible way out instead of a spinner that runs forever.
  useEffect(() => {
    if (!upload.isPending) return;
    const timer = setTimeout(() => {
      logGuestPortalEvent({
        event: "id_upload_stalled",
        bookingId,
        component: "GuestDocumentUpload",
        errorCode: "upload_stalled",
        errorMessage: "Upload exceeded 25s without completing",
      });
      setStalled(
        t(
          "documents.uploadStalled",
          "Your ID upload is taking longer than expected. Check your connection and try again — if it keeps failing, contact the front desk and we can take it another way.",
        ),
      );
    }, 25_000);
    return () => clearTimeout(timer);
  }, [upload.isPending, bookingId, t]);


  // Guests can be sent straight here from the "Upload ID" shortcut on the stay
  // summary — open the picker so the tap does something visible.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { bookingId?: string } | undefined;
      if (detail?.bookingId && detail.bookingId !== bookingId) return;
      if (!canUpload) return;
      fileRef.current?.click();
    };
    window.addEventListener("guest-open-id-picker", onOpen as EventListener);
    return () => window.removeEventListener("guest-open-id-picker", onOpen as EventListener);
  }, [bookingId, canUpload]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      logGuestPortalEvent({
        event: "id_upload_validation_failed",
        bookingId,
        status: "warn",
        severity: "warning",
        component: "GuestDocumentUpload",
        errorCode: "invalid_file_type",
        metadata: { file_type: file.type },
      });
      toast({ title: t("documents.invalidFileType"), description: t("documents.invalidFileTypeDesc"), variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      logGuestPortalEvent({
        event: "id_upload_validation_failed",
        bookingId,
        status: "warn",
        severity: "warning",
        component: "GuestDocumentUpload",
        errorCode: "file_too_large",
        metadata: { file_size: file.size },
      });
      toast({ title: t("documents.fileTooLarge"), description: t("documents.fileTooLargeDesc"), variant: "destructive" });
      return;
    }
    logGuestPortalEvent({
      event: "id_upload_started",
      bookingId,
      component: "GuestDocumentUpload",
      metadata: { file_type: file.type, file_size: file.size, document_type: documentType ?? null },
    });
    setStalled(null);
    lastFileRef.current = file;
    try {
      await upload.mutateAsync({ bookingId, file, documentType });
      logGuestPortalEvent({
        event: "id_upload_success",
        bookingId,
        status: "ok",
        component: "GuestDocumentUpload",
      });
      toast({ title: t("documents.documentUploaded") });
      // The list refreshes from the server. If the document still isn't there
      // shortly after, tell the guest instead of showing an empty section that
      // looks like the upload silently vanished.
      setTimeout(async () => {
        const { data } = await refetch();
        const found = (data ?? []).some((d) => d.file_name === file.name);
        if (!found) {
          logGuestPortalEvent({
            event: "id_upload_stalled",
            bookingId,
            component: "GuestDocumentUpload",
            errorCode: "document_not_visible",
            errorMessage: "Uploaded document did not appear in the list",
          });
          setStalled(
            t(
              "documents.uploadNotVisible",
              "We saved your upload but it hasn't appeared yet. Refresh to check again — if it still isn't listed, upload it once more or contact the front desk.",
            ),
          );
        }
      }, 8000);
    } catch (err: any) {
      logGuestPortalEvent({
        event: "id_upload_failed",
        bookingId,
        component: "GuestDocumentUpload",
        errorCode: "upload_failed",
        errorMessage: String(err?.message ?? "Upload failed"),
      });
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
      setStalled(
        String(err?.message ?? "") ||
          t("documents.uploadFailedRecovery", "Your ID upload didn't go through. Try again, or contact the front desk."),
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  };



  const handleDelete = async (doc: GuestDocument) => {
    try {
      await deleteDoc.mutateAsync({ id: doc.id, filePath: doc.file_path, bookingId });
      toast({ title: t("documents.documentRemoved") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      {!hideHeading && (
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {hasDocuments ? (
                <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              )}
              {title ?? t("documents.idDocuments")}
            </h4>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 pl-6">{subtitle}</p>
            )}
          </div>
          {hasDocuments ? (
            <Badge className="text-xs bg-success/20 text-[hsl(var(--success))]">On file</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">Not on file</Badge>
          )}
        </div>
      )}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : documents && documents.length > 0 ? (
        isStaff ? (
          // Staff get the controlled vault view: secure open/download, review
          // status, TM30 flag, and version history.
          <StaffDocumentReview documents={documents} />
        ) : (
          <div className="space-y-2">
            {(() => {
              const latest = documents[0];
              const status = latest?.review_status;
              if (status === "accepted" || status === "reviewed") {
                return (
                  <p className="text-sm text-[hsl(var(--success))]">
                    {t("documents.received", "ID document received.")}
                  </p>
                );
              }
              if (status === "needs_replacement") {
                return (
                  <p className="text-sm text-destructive">
                    {t(
                      "documents.needsReplacement",
                      "Please upload a clearer ID/passport document.",
                    )}
                  </p>
                );
              }
              return null;
            })()}
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                canDelete={canDelete}
                isStaff={isStaff}
                onDelete={handleDelete}
                deleteDisabled={deleteDoc.isPending}
              />
            ))}
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t("documents.noDocuments")}</p>
      )}
      {canUpload && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="w-full"
          >
            <Upload className="h-4 w-4 mr-2" />
            {upload.isPending ? t("common.uploading") : t("documents.uploadDocument")}
          </Button>
          {stalled && (
            <GuestRecoveryNotice
              message={stalled}
              onRetry={() => {
                setStalled(null);
                void refetch();
                fileRef.current?.click();
              }}
              retryLabel={t("documents.retryUpload", "Refresh & try again")}
              onDismiss={() => setStalled(null)}
            />
          )}
        </>
      )}

    </div>
  );
}
