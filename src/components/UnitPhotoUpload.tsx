import { useState, useRef } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UnitPhotoUploadProps {
  unitId?: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}

export function UnitPhotoUpload({ unitId, photos, onChange }: UnitPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadFiles = async (files: FileList) => {
    if (!unitId) {
      toast({ title: "Save the unit first", description: "Photos can be uploaded after the unit is created.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const newPhotos = [...photos];
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `${unitId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("unit-photos").upload(path, file, { upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("unit-photos").getPublicUrl(path);
        newPhotos.push(urlData.publicUrl);
      }
      onChange(newPhotos);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (url: string) => {
    // Extract path from URL
    const parts = url.split("/unit-photos/");
    if (parts.length === 2) {
      const path = parts[1];
      await supabase.storage.from("unit-photos").remove([path]);
    }
    onChange(photos.filter((p) => p !== url));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((url) => (
            <div key={url} className="relative group aspect-square rounded-md overflow-hidden border border-border">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
        ) : (
          <>
            <ImagePlus className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Drop images or click to upload</p>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && uploadFiles(e.target.files)}
      />
    </div>
  );
}
