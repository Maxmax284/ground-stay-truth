import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useGuestDocuments, useUploadGuestDocument, useDeleteGuestDocument } from "@/hooks/useGuestDocuments";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { format } from "date-fns";
import { Upload, FileText, Trash2, ShieldCheck, ShieldAlert } from "lucide-react";

interface GuestDocumentUploadProps { bookingId: string; showRequirement?: boolean; }

export function GuestDocumentUpload({ bookingId, showRequirement }: GuestDocumentUploadProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: documents, isLoading } = useGuestDocuments(bookingId);
  const upload = useUploadGuestDocument();
  const deleteDoc = useDeleteGuestDocument();
  const canUpload = permissions.canUploadDocuments(role);
  const canDelete = permissions.canManageUnits(role);
  const hasDocuments = (documents?.length ?? 0) > 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) { toast({ title: t("documents.invalidFileType"), description: t("documents.invalidFileTypeDesc"), variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: t("documents.fileTooLarge"), description: t("documents.fileTooLargeDesc"), variant: "destructive" }); return; }
    try { await upload.mutateAsync({ bookingId, file }); toast({ title: t("documents.documentUploaded") }); } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (doc: { id: string; file_path: string }) => {
    try { await deleteDoc.mutateAsync({ id: doc.id, filePath: doc.file_path, bookingId }); toast({ title: t("documents.documentRemoved") }); } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">{hasDocuments ? <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}{t("documents.idDocuments")}</h4>
        {showRequirement && !hasDocuments && <Badge variant="destructive" className="text-xs">{t("documents.requiredForCheckin")}</Badge>}
        {showRequirement && hasDocuments && <Badge className="text-xs bg-success/20 text-[hsl(var(--success))]">{t("documents.verified")}</Badge>}
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">{t("common.loading")}</p> : documents && documents.length > 0 ? (
        <div className="space-y-2">{documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between text-sm border rounded-md p-2">
            <div className="flex items-center gap-2 min-w-0"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{doc.file_name}</span></div>
            <div className="flex items-center gap-2 shrink-0"><span className="text-xs text-muted-foreground">{format(new Date(doc.created_at), "MMM d")}</span>{canDelete && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(doc)} disabled={deleteDoc.isPending}><Trash2 className="h-3 w-3" /></Button>}</div>
          </div>
        ))}</div>
      ) : <p className="text-sm text-muted-foreground">{t("documents.noDocuments")}</p>}
      {canUpload && (<><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleFileChange} /><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={upload.isPending} className="w-full"><Upload className="h-4 w-4 mr-2" />{upload.isPending ? t("common.uploading") : t("documents.uploadDocument")}</Button></>)}
    </div>
  );
}
