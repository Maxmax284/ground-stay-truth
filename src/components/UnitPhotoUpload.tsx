import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, X, Loader2, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UnitPhotoUploadProps { unitId?: string; photos: string[]; onChange: (photos: string[]) => void; }

export function UnitPhotoUpload({ unitId, photos, onChange }: UnitPhotoUploadProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadFiles = async (files: FileList) => {
    if (!unitId) { toast({ title: t("units.saveFirst"), variant: "destructive" }); return; }
    setUploading(true);
    const newPhotos = [...photos];
    try {
      for (const file of Array.from(files)) { const ext = file.name.split(".").pop(); const path = `${unitId}/${crypto.randomUUID()}.${ext}`; const { error } = await supabase.storage.from("unit-photos").upload(path, file, { upsert: false }); if (error) throw error; const { data: urlData } = supabase.storage.from("unit-photos").getPublicUrl(path); newPhotos.push(urlData.publicUrl); }
      onChange(newPhotos);
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const removePhoto = async (url: string) => { const parts = url.split("/unit-photos/"); if (parts.length === 2) { await supabase.storage.from("unit-photos").remove([parts[1]]); } onChange(photos.filter((p) => p !== url)); };

  const handleFileDrop = (e: React.DragEvent) => { e.preventDefault(); if (dragIndex !== null) return; if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); };

  const handleReorderDragStart = useCallback((index: number) => setDragIndex(index), []);
  const handleReorderDragOver = useCallback((e: React.DragEvent, index: number) => { e.preventDefault(); setOverIndex(index); }, []);
  const handleReorderDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault(); if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); setOverIndex(null); return; }
    const reordered = [...photos]; const [moved] = reordered.splice(dragIndex, 1); reordered.splice(dropIndex, 0, moved); onChange(reordered); setDragIndex(null); setOverIndex(null);
  }, [dragIndex, photos, onChange]);
  const handleReorderDragEnd = useCallback(() => { setDragIndex(null); setOverIndex(null); }, []);

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">{t("units.dragToReorder")}</p>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((url, idx) => (
              <div key={url} draggable onDragStart={() => handleReorderDragStart(idx)} onDragOver={(e) => handleReorderDragOver(e, idx)} onDrop={(e) => handleReorderDrop(e, idx)} onDragEnd={handleReorderDragEnd}
                className={`relative group aspect-square rounded-md overflow-hidden border transition-all cursor-grab active:cursor-grabbing ${idx === 0 ? "ring-2 ring-primary border-primary" : "border-border"} ${overIndex === idx && dragIndex !== idx ? "ring-2 ring-accent border-accent" : ""} ${dragIndex === idx ? "opacity-40" : ""}`}>
                <img src={url} alt="" className="w-full h-full object-cover" />
                {idx === 0 && <span className="absolute bottom-1 left-1 bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">{t("units.hero")}</span>}
                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity"><GripVertical className="h-4 w-4 text-background drop-shadow" /></div>
                <button type="button" onClick={() => removePhoto(url)} className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3.5 w-3.5 text-destructive" /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <div onDragOver={(e) => { if (dragIndex === null) e.preventDefault(); }} onDrop={handleFileDrop} onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors">
        {uploading ? <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /> : <><ImagePlus className="h-5 w-5 mx-auto text-muted-foreground mb-1" /><p className="text-xs text-muted-foreground">{t("units.dropOrClick")}</p></>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
    </div>
  );
}
