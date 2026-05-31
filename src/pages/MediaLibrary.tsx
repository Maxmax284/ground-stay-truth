import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Loader2, Trash2, Link2, Check, ImageOff, Copy } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUnits, useUpdateUnit } from "@/hooks/useUnits";

const BUCKET = "unit-photos";
const LIBRARY_PREFIX = "library";

type LibraryPhoto = {
  path: string;
  url: string;
  name: string;
  size: number;
  createdAt: string;
};

async function listAllPhotos(): Promise<LibraryPhoto[]> {
  // List root folders, then each folder's files. unit-photos is structured
  // as `{unitId|library}/{filename}`.
  const { data: folders, error } = await supabase.storage
    .from(BUCKET)
    .list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;

  const results: LibraryPhoto[] = [];
  for (const folder of folders ?? []) {
    if (!folder.name) continue;
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(folder.name, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
    for (const f of files ?? []) {
      if (!f.name || f.id === null) continue; // skip subfolders
      const path = `${folder.name}/${f.name}`;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      results.push({
        path,
        url: urlData.publicUrl,
        name: f.name,
        size: (f.metadata as any)?.size ?? 0,
        createdAt: (f as any).created_at ?? "",
      });
    }
  }
  results.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return results;
}

export default function MediaLibrary() {
  const { toast } = useToast();
  const { data: units } = useUnits();
  const updateUnit = useUpdateUnit();
  const fileRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTargetUnitId, setAssignTargetUnitId] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    try {
      setPhotos(await listAllPhotos());
    } catch (err: any) {
      toast({ title: "Failed to load library", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Map url -> unit names that use it
  const usageByUrl = useMemo(() => {
    const map = new Map<string, string[]>();
    (units ?? []).forEach((u) => {
      (u.photos ?? []).forEach((p) => {
        const arr = map.get(p) ?? [];
        arr.push(u.name);
        map.set(p, arr);
      });
    });
    return map;
  }, [units]);

  const filteredPhotos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return photos;
    return photos.filter((p) => p.path.toLowerCase().includes(q));
  }, [photos, search]);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${LIBRARY_PREFIX}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (error) throw error;
      }
      toast({ title: `Uploaded ${files.length} photo${files.length > 1 ? "s" : ""}` });
      await refresh();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedPhotos = useMemo(
    () => photos.filter((p) => selected.has(p.path)),
    [photos, selected],
  );

  const handleAssign = async () => {
    if (!assignTargetUnitId || selectedPhotos.length === 0) return;
    const unit = units?.find((u) => u.id === assignTargetUnitId);
    if (!unit) return;
    const existing = unit.photos ?? [];
    const additions = selectedPhotos.map((p) => p.url).filter((u) => !existing.includes(u));
    if (additions.length === 0) {
      toast({ title: "Already assigned", description: "These photos are already on the unit." });
      setAssignOpen(false);
      return;
    }
    try {
      await updateUnit.mutateAsync({ id: unit.id, photos: [...existing, ...additions] });
      toast({ title: `Assigned ${additions.length} photo${additions.length > 1 ? "s" : ""} to ${unit.name}` });
      setAssignOpen(false);
      setSelected(new Set());
      setAssignTargetUnitId("");
    } catch (err: any) {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (selectedPhotos.length === 0) return;
    const inUse = selectedPhotos.filter((p) => (usageByUrl.get(p.url) ?? []).length > 0);
    const confirmMsg =
      inUse.length > 0
        ? `Delete ${selectedPhotos.length} photo(s)? ${inUse.length} are assigned to units and will become broken links.`
        : `Delete ${selectedPhotos.length} photo(s) from storage?`;
    if (!confirm(confirmMsg)) return;
    try {
      const { error } = await supabase.storage.from(BUCKET).remove(selectedPhotos.map((p) => p.path));
      if (error) throw error;
      toast({ title: "Deleted" });
      setSelected(new Set());
      await refresh();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "URL copied" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Media Library</h1>
            <p className="text-sm text-muted-foreground">
              Upload, organize, and assign photos to units.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <Input
            placeholder="Search filename or folder…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="secondary">{selected.size} selected</Badge>
              <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                <Link2 className="h-4 w-4" /> Assign to unit
              </Button>
              <Button size="sm" variant="outline" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPhotos.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ImageOff className="h-10 w-10 mb-2" />
            <p>No photos yet. Upload some to get started.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredPhotos.map((p) => {
              const usage = usageByUrl.get(p.url) ?? [];
              const isSelected = selected.has(p.path);
              return (
                <div
                  key={p.path}
                  onClick={() => toggleSelect(p.path)}
                  className={`group relative aspect-square rounded-md overflow-hidden border cursor-pointer transition-all ${
                    isSelected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary/50"
                  }`}
                >
                  <img src={p.url} alt={p.name} loading="lazy" className="w-full h-full object-cover" />

                  <div className="absolute top-1.5 left-1.5">
                    <div
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? "bg-primary border-primary" : "bg-background/80 border-background/80"
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                    </div>
                  </div>

                  {usage.length > 0 && (
                    <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0">
                      {usage.length} unit{usage.length > 1 ? "s" : ""}
                    </Badge>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyUrl(p.url);
                    }}
                    className="absolute bottom-1.5 right-1.5 bg-background/80 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy URL"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate font-mono">{p.path}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selectedPhotos.length} photo(s) to a unit</DialogTitle>
            <DialogDescription>
              Photos will be appended to the unit's existing gallery. The first photo on the unit
              remains the hero.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-72 -mx-2 px-2">
            <div className="space-y-1">
              {(units ?? []).map((u) => (
                <label
                  key={u.id}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent ${
                    assignTargetUnitId === u.id ? "bg-accent" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="assign-unit"
                    checked={assignTargetUnitId === u.id}
                    onChange={() => setAssignTargetUnitId(u.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(u.photos ?? []).length} existing photo(s)
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!assignTargetUnitId || updateUnit.isPending}>
              {updateUnit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
