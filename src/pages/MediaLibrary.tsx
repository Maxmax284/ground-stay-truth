import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Upload, Loader2, Trash2, Link2, Check, ImageOff, Copy, Folder, FolderPlus,
  FolderInput, Filter, X, Tag, Pencil, Unlink, Search, ZoomIn,
  AlertTriangle, RotateCcw, Download, ChevronDown,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUnits, useUpdateUnit } from "@/hooks/useUnits";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useMediaAssets, useUpsertMediaAsset, useUpdateMediaAsset,
  useBulkUpdateFolder, useDeleteMediaAssets,
  DEFAULT_FOLDERS, UNCATEGORIZED, type MediaAsset,
} from "@/hooks/useMediaLibrary";
import {
  downloadSingleAsset, downloadAssetsAsZip, zipFilename, type ZipProgress,
} from "@/lib/mediaDownload";
import { buildMediaCsv, downloadCsv, fetchUploaderNames } from "@/lib/mediaCsv";


const BUCKET = "unit-photos";
const LIBRARY_PREFIX = "library";

type PhotoRow = MediaAsset & { url: string };

type UploadJob = {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  file: File;
  folder: string;
  error?: string;
};

const errorMessage = (err: unknown) => err instanceof Error ? err.message : String(err || "Failed");

export default function MediaLibrary() {
  const { toast } = useToast();
  const { data: units } = useUnits();
  const updateUnit = useUpdateUnit();
  const { data: assets, isLoading } = useMediaAssets();
  const upsertAsset = useUpsertMediaAsset();
  const updateAsset = useUpdateMediaAsset();
  const bulkFolder = useBulkUpdateFolder();
  const deleteAssets = useDeleteMediaAssets();

  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // by asset id
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string>("__all__");
  const [unitFilter, setUnitFilter] = useState<string>("__all__");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTargetUnitId, setAssignTargetUnitId] = useState<string>("");
  const [removeUnitOpen, setRemoveUnitOpen] = useState(false);
  const [removeUnitId, setRemoveUnitId] = useState<string>("");
  const [editing, setEditing] = useState<PhotoRow | null>(null);
  const [lightbox, setLightbox] = useState<PhotoRow | null>(null);
  const [uploadFolder, setUploadFolder] = useState<string>(UNCATEGORIZED);
  const [uploadFolderOpen, setUploadFolderOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ files: File[]; duplicates: string[] } | null>(null);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  // Download state — single flight at a time so the tab never juggles two zips.
  const [zipProgress, setZipProgress] = useState<(ZipProgress & { label: string }) | null>(null);
  const [singleDownload, setSingleDownload] = useState<{ name: string; attempt: number; attempts: number; saving?: boolean } | null>(null);
  // Files that failed every retry in the last bulk run — offered back as a one-tap retry.
  const [failedBatch, setFailedBatch] = useState<{ rows: PhotoRow[]; label: string } | null>(null);
  const zipAbortRef = useRef<AbortController | null>(null);


  // Build photo rows: combine assets with public URLs
  const photos: PhotoRow[] = useMemo(() => {
    // Trust the DB — show every media_library_assets row. Broken/missing files
    // are filtered later via the <img onError> handler, not by storage listing
    // (which only sees the `library/` prefix and would hide backfilled unit photos).
    return (assets ?? []).map((a) => {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path);
      return { ...a, url: data.publicUrl };
    });
  }, [assets]);

  const displayPhotos = useMemo(() => photos.filter((p) => !imageErrors.has(p.id)), [photos, imageErrors]);

  // Sync orphans: storage files in `library/` not in DB (legacy)
  useEffect(() => {
    if (!assets) return;
    let cancelled = false;
    (async () => {
      const { data: files } = await supabase.storage
        .from(BUCKET)
        .list(LIBRARY_PREFIX, { limit: 1000 });
      if (cancelled || !files) return;
      const existing = new Set(assets.map((a) => a.storage_path));
      const orphans = files.filter((f) => f.id !== null && !existing.has(`${LIBRARY_PREFIX}/${f.name}`));
      for (const f of orphans) {
        await upsertAsset.mutateAsync({
          storage_path: `${LIBRARY_PREFIX}/${f.name}`,
          original_filename: f.name,
          folder: UNCATEGORIZED,
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets?.length]);

  // Usage map: url -> unit names
  const usageByUrl = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    (units ?? []).forEach((u) => {
      (u.photos ?? []).forEach((p) => {
        const arr = m.get(p) ?? [];
        arr.push({ id: u.id, name: u.name });
        m.set(p, arr);
      });
    });
    return m;
  }, [units]);

  // Photos currently assigned to at least one unit — "in use as we speak".
  const inUsePhotos = useMemo(
    () => displayPhotos.filter((p) => (usageByUrl.get(p.url) ?? []).length > 0),
    [displayPhotos, usageByUrl],
  );



  // Folder list
  const folders = useMemo(() => {
    const set = new Set<string>([UNCATEGORIZED, ...DEFAULT_FOLDERS, ...customFolders]);
    photos.forEach((a) => set.add(a.folder));
    return Array.from(set).sort((a, b) => {
      if (a === UNCATEGORIZED) return -1;
      if (b === UNCATEGORIZED) return 1;
      return a.localeCompare(b);
    });
  }, [photos, customFolders]);

  // Folder counts
  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    displayPhotos.forEach((a) => m.set(a.folder, (m.get(a.folder) ?? 0) + 1));
    return m;
  }, [displayPhotos]);

  const filtered: PhotoRow[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = displayPhotos.filter((p) => {
      if (activeFolder === "__unused__") {
        if ((usageByUrl.get(p.url) ?? []).length !== 0) return false;
      } else if (activeFolder !== "__all__") {
        if (p.folder !== activeFolder) return false;
      }
      if (usageFilter === "used" && (usageByUrl.get(p.url) ?? []).length === 0) return false;
      if (usageFilter === "unused" && (usageByUrl.get(p.url) ?? []).length > 0) return false;
      if (unitFilter !== "__all__") {
        const u = usageByUrl.get(p.url) ?? [];
        if (!u.some((x) => x.id === unitFilter)) return false;
      }
      if (q) {
        const hay = [p.original_filename, p.caption, p.alt_text, p.folder, ...(p.tags ?? [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      const cmp = (b.created_at || "").localeCompare(a.created_at || "");
      return sortBy === "newest" ? cmp : -cmp;
    });
    return out;
  }, [displayPhotos, activeFolder, usageFilter, unitFilter, search, sortBy, usageByUrl]);

  const selectedPhotos = useMemo(() => filtered.filter((p) => selected.has(p.id)), [filtered, selected]);
  const allSelectedPaths = useMemo(() => photos.filter((p) => selected.has(p.id)), [photos, selected]);
  const uploadStats = useMemo(() => {
    const done = uploadJobs.filter((j) => j.status === "done").length;
    const failed = uploadJobs.filter((j) => j.status === "error").length;
    const uploading = uploadJobs.filter((j) => j.status === "uploading").length;
    return { done, failed, uploading, total: uploadJobs.length };
  }, [uploadJobs]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectAllVisible = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  // Upload flow — skip folder modal, use active folder (or Uncategorized)
  const beginUpload = (files: File[]) => {
    if (!files.length) return;
    const existingNames = new Set((assets ?? []).map((a) => a.original_filename).filter(Boolean) as string[]);
    const duplicates = files.map((f) => f.name).filter((n) => existingNames.has(n));
    if (duplicates.length > 0) { setDuplicateWarning({ files, duplicates }); return; }
    const targetFolder = activeFolder && activeFolder !== "__all__" && activeFolder !== "__unused__"
      ? activeFolder
      : UNCATEGORIZED;
    performUpload(files, targetFolder);
  };

  const uploadOne = async (file: File, jobId: string, folder: string) => {
    let tick: ReturnType<typeof setInterval> | null = null;
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${LIBRARY_PREFIX}/${crypto.randomUUID()}.${ext}`;
      setUploadJobs((p) => p.map((j) => j.id === jobId ? { ...j, progress: 10, status: "uploading", error: undefined } : j));
      // Steady progress while awaiting the SDK (no native progress events)
      tick = setInterval(() => {
        setUploadJobs((p) => p.map((j) => j.id === jobId && j.status === "uploading" && j.progress < 85
          ? { ...j, progress: Math.min(85, j.progress + 7) } : j));
      }, 300);
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      await upsertAsset.mutateAsync({
        storage_path: path, original_filename: file.name, folder,
        uploaded_by: u.user?.id ?? null,
      });
      setUploadJobs((p) => p.map((j) => j.id === jobId ? { ...j, progress: 100, status: "done" } : j));
      return true;
    } catch (err: unknown) {
      setUploadJobs((p) => p.map((j) => j.id === jobId ? {
        ...j, progress: 100, status: "error", error: errorMessage(err),
      } : j));
      return false;
    } finally {
      if (tick) clearInterval(tick);
    }
  };

  const performUpload = async (files: File[], folder: string, replaceIds: string[] = []) => {
    const jobs: UploadJob[] = files.map((f) => ({
      id: crypto.randomUUID(), name: f.name, progress: 0, status: "uploading", file: f, folder,
    }));
    setUploadJobs((prev) => [...jobs, ...prev.filter((j) => !replaceIds.includes(j.id))]);
    toast({ title: `Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…` });
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]; const job = jobs[i];
      const ok = await uploadOne(file, job.id, folder);
      if (ok) succeeded++;
      else failed++;
    }
    toast({
      title: failed ? `Uploaded ${succeeded} of ${files.length}` : `Uploaded ${succeeded} photo${succeeded === 1 ? "" : "s"}`,
      description: failed ? `${failed} failed. Use Retry failed in the upload panel.` : undefined,
      variant: failed ? "destructive" : undefined,
    });
    if (!failed) setTimeout(() => setUploadJobs((p) => p.filter((j) => j.status === "uploading")), 3000);
    if (fileRef.current) fileRef.current.value = "";
  };

  const retryFailedUploads = () => {
    const failedJobs = uploadJobs.filter((j) => j.status === "error");
    if (!failedJobs.length) return;
    const byFolder = new Map<string, UploadJob[]>();
    failedJobs.forEach((job) => byFolder.set(job.folder, [...(byFolder.get(job.folder) ?? []), job]));
    byFolder.forEach((jobs, folder) => {
      performUpload(jobs.map((j) => j.file), folder, jobs.map((j) => j.id));
    });
  };

  const handleConfirmUploadFolder = () => {
    if (!pendingFiles) return;
    setUploadFolderOpen(false);
    performUpload(pendingFiles, uploadFolder);
    setPendingFiles(null);
  };

  // Bulk ops
  const handleBulkDelete = async () => {
    if (allSelectedPaths.length === 0) return;
    const inUse = allSelectedPaths.filter((p) => (usageByUrl.get(p.url) ?? []).length > 0);
    const msg = inUse.length > 0
      ? `Delete ${allSelectedPaths.length} photo(s)? ${inUse.length} are still assigned to units and will become broken links.`
      : `Delete ${allSelectedPaths.length} photo(s)?`;
    if (!confirm(msg)) return;
    try {
      await deleteAssets.mutateAsync(allSelectedPaths.map((p) => p.storage_path));
      toast({ title: "Deleted" });
      setSelected(new Set());
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleBulkMove = async () => {
    if (!moveTarget || allSelectedPaths.length === 0) return;
    try {
      await bulkFolder.mutateAsync({ ids: allSelectedPaths.map((p) => p.id), folder: moveTarget });
      toast({ title: `Moved to ${moveTarget}` });
      setMoveOpen(false); setMoveTarget(""); setSelected(new Set());
    } catch (err: unknown) {
      toast({ title: "Move failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleBulkAssign = async () => {
    if (!assignTargetUnitId || allSelectedPaths.length === 0) return;
    const unit = units?.find((u) => u.id === assignTargetUnitId);
    if (!unit) return;
    const existing = unit.photos ?? [];
    const additions = allSelectedPaths.map((p) => p.url).filter((u) => !existing.includes(u));
    if (additions.length === 0) { toast({ title: "Already assigned" }); setAssignOpen(false); return; }
    try {
      await updateUnit.mutateAsync({ id: unit.id, photos: [...existing, ...additions] });
      toast({ title: `Assigned ${additions.length} to ${unit.name}` });
      setAssignOpen(false); setAssignTargetUnitId(""); setSelected(new Set());
    } catch (err: unknown) {
      toast({ title: "Assignment failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleBulkRemoveFromUnit = async () => {
    if (!removeUnitId || allSelectedPaths.length === 0) return;
    const unit = units?.find((u) => u.id === removeUnitId);
    if (!unit) return;
    const urls = new Set(allSelectedPaths.map((p) => p.url));
    const next = (unit.photos ?? []).filter((u) => !urls.has(u));
    const removed = (unit.photos ?? []).length - next.length;
    if (removed === 0) { toast({ title: "Nothing to remove" }); setRemoveUnitOpen(false); return; }
    try {
      await updateUnit.mutateAsync({ id: unit.id, photos: next });
      toast({ title: `Removed ${removed} from ${unit.name}` });
      setRemoveUnitOpen(false); setRemoveUnitId(""); setSelected(new Set());
    } catch (err: unknown) {
      toast({ title: "Remove failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const copyUrl = async (url: string) => { await navigator.clipboard.writeText(url); toast({ title: "URL copied" }); };

  // ---- Downloads -----------------------------------------------------------
  const exportCsv = async () => {
    try {
      const rows = displayPhotos.map((p) => ({
        original_filename: p.original_filename,
        storage_path: p.storage_path,
        folder: p.folder,
        created_at: p.created_at,
        uploaded_by: p.uploaded_by,
        usedBy: (usageByUrl.get(p.url) ?? []).map((u) => u.name),
      }));
      const uploaders = await fetchUploaderNames(rows.map((r) => r.uploaded_by || ""));
      downloadCsv(
        buildMediaCsv(rows, uploaders),
        `media-library-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast({ title: `Exported ${rows.length} rows to CSV` });
    } catch (err) {
      toast({ title: "CSV export failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleSingleDownload = async (p: PhotoRow) => {
    setSingleDownload({ name: p.original_filename || p.storage_path.split("/").pop() || "photo", attempt: 1, attempts: 3 });
    try {
      await downloadSingleAsset(p, (prog) =>
        setSingleDownload({
          name: p.original_filename || p.storage_path.split("/").pop() || "photo",
          attempt: prog.attempt,
          attempts: prog.attempts,
          saving: prog.phase === "saving",
        }),
      );
    } catch (err: unknown) {
      toast({
        title: "Download failed",
        description: `${errorMessage(err)} — tap the download icon again to retry.`,
        variant: "destructive",
      });
    } finally {
      setSingleDownload(null);
    }
  };

  const runZipDownload = async (rows: PhotoRow[], label: string, pass = 0) => {
    if (zipProgress) return;
    if (rows.length === 0) { toast({ title: "Nothing to download" }); return; }
    if (rows.length === 1) { await handleSingleDownload(rows[0]); return; }
    if (pass === 0 && rows.length > 200 && !window.confirm(`Download ${rows.length} photos as one zip? This may take a few minutes.`)) return;

    const controller = new AbortController();
    zipAbortRef.current = controller;
    setFailedBatch(null);
    setZipProgress({ done: 0, total: rows.length, phase: "fetching", failed: 0, pass, label });
    try {
      const { added, failedAssets, aborted } = await downloadAssetsAsZip(
        rows,
        zipFilename(label),
        (p) => setZipProgress({ ...p, label }),
        { signal: controller.signal, pass },
      );
      if (aborted) {
        toast({ title: "Download cancelled" });
      } else if (added === 0) {
        setFailedBatch({ rows: failedAssets as PhotoRow[], label });
        toast({ title: "Download failed", description: "None of the files could be fetched. Use Retry to try again.", variant: "destructive" });
      } else {
        if (failedAssets.length > 0) setFailedBatch({ rows: failedAssets as PhotoRow[], label });
        toast({
          title: `Downloaded ${added} photo${added === 1 ? "" : "s"}`,
          description: failedAssets.length > 0
            ? `${failedAssets.length} could not be fetched. Use Retry missed files to grab just those.`
            : undefined,
        });
      }
    } catch (err: unknown) {
      setFailedBatch({ rows, label });
      toast({ title: "Download failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      zipAbortRef.current = null;
      setZipProgress(null);
    }
  };



  // Drag-drop on whole grid
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragOver(false);
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) beginUpload(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Media Library</h1>
            <p className="text-sm text-muted-foreground">Organize, tag, and assign photos to units.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!!zipProgress}>
                  {zipProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => runZipDownload(displayPhotos, "everything")}>
                  Everything ({displayPhotos.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runZipDownload(inUsePhotos, "in-use")}>
                  Only photos in use ({inUsePhotos.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runZipDownload(filtered, "current-view")}>
                  Current view ({filtered.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>
                  Export list as CSV (spreadsheet)
                </DropdownMenuItem>
              </DropdownMenuContent>

            </DropdownMenu>
            <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="h-4 w-4" /> New folder
            </Button>

            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => e.target.files && beginUpload(Array.from(e.target.files))} />
          </div>
        </div>

        {uploadJobs.length > 0 && (
          <Card className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] max-h-[min(560px,calc(100vh-2rem))] shadow-2xl border-primary/30 bg-card/95 backdrop-blur flex flex-col overflow-hidden">
            <div className="p-3 border-b space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium min-w-0">
                  {uploadStats.uploading > 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  ) : uploadStats.failed > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <span className="truncate">
                    {uploadStats.uploading > 0 ? "Uploading media" : uploadStats.failed > 0 ? "Upload finished with misses" : "Upload complete"}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setUploadJobs([])}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-accent/60 px-2 py-1.5"><span className="font-semibold">{uploadStats.done}</span> done</div>
                <div className="rounded-md bg-accent/60 px-2 py-1.5"><span className="font-semibold">{uploadStats.uploading}</span> moving</div>
                <div className="rounded-md bg-accent/60 px-2 py-1.5"><span className="font-semibold text-destructive">{uploadStats.failed}</span> failed</div>
              </div>
              {uploadStats.failed > 0 && (
                <Button size="sm" variant="outline" className="w-full" onClick={retryFailedUploads} disabled={uploadStats.uploading > 0}>
                  <RotateCcw className="h-4 w-4" /> Retry failed
                </Button>
              )}
            </div>
            <ScrollArea className="min-h-0 max-h-[420px]">
              <div className="p-3 space-y-2">
                {uploadJobs.map((j) => (
                  <div key={j.id} className="space-y-1 rounded-md border bg-background/40 p-2">
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="truncate min-w-0">{j.name}</span>
                      <span className={j.status === "error" ? "text-destructive shrink-0" : "text-muted-foreground shrink-0"}>
                        {j.status === "error" ? "Failed" : j.status === "done" ? "Done" : `${j.progress}%`}
                      </span>
                    </div>
                    <Progress value={j.progress} className="h-1.5" />
                    {j.status === "error" && j.error && (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-destructive line-clamp-2 min-w-0">{j.error}</p>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] shrink-0"
                          onClick={() => performUpload([j.file], j.folder, [j.id])} disabled={uploadStats.uploading > 0}>
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}

        {uploadStats.failed > 0 && uploadStats.uploading === 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span>{uploadStats.done} uploaded, {uploadStats.failed} failed. Library count only reflects files that actually made it through.</span>
            </div>
            <Button size="sm" variant="outline" onClick={retryFailedUploads}>
              <RotateCcw className="h-4 w-4" /> Retry failed
            </Button>
          </div>
        )}

        <div className="grid md:grid-cols-[220px_1fr] gap-4">
          {/* Folders sidebar */}
          <Card className="p-2 h-fit">
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-0.5">
                <FolderButton label="All photos" count={displayPhotos.length}
                  active={activeFolder === "__all__"} onClick={() => setActiveFolder("__all__")} icon="all" />
                <FolderButton label="Unused" count={displayPhotos.filter((p) => (usageByUrl.get(p.url) ?? []).length === 0).length}
                  active={activeFolder === "__unused__"} onClick={() => setActiveFolder("__unused__")} icon="unused" />
                <div className="h-px bg-border my-1" />
                {folders.map((f) => (
                  <FolderButton key={f} label={f} count={folderCounts.get(f) ?? 0}
                    active={activeFolder === f} onClick={() => setActiveFolder(f)} icon="folder" />
                ))}
              </div>
            </ScrollArea>
          </Card>

          {/* Main */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input placeholder="Search filename, caption, tags…" value={search}
                  onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger className="sm:w-44"><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All units</SelectItem>
                  {(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={usageFilter} onValueChange={(v) => setUsageFilter(v as "all" | "used" | "unused")}>
                <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All usage</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                  <SelectItem value="unused">Unused</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as "newest" | "oldest")}>
                <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selected.size > 0 && (
              <div className="flex flex-wrap gap-2 items-center p-2 rounded-md bg-accent/50 border">
                <Badge variant="secondary">{selected.size} selected</Badge>
                <Button size="sm" variant="outline" onClick={() => setMoveOpen(true)}>
                  <FolderInput className="h-4 w-4" /> Move
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                  <Link2 className="h-4 w-4" /> Assign to unit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRemoveUnitOpen(true)}>
                  <Unlink className="h-4 w-4" /> Remove from unit
                </Button>
                <Button size="sm" variant="outline" disabled={!!zipProgress}
                  onClick={() => runZipDownload(allSelectedPaths, `${allSelectedPaths.length}-selected`)}>
                  {zipProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download ({selected.size})
                </Button>
                <Button size="sm" variant="outline" onClick={handleBulkDelete}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            )}

            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>
                {filtered.length} matching photo(s)
                {assets && assets.length !== displayPhotos.length && ` · ${assets.length - displayPhotos.length} hidden/broken`}
              </span>
              {filtered.length > 0 && (
                <button className="hover:text-foreground" onClick={selectAllVisible}>
                  {selected.size === filtered.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              className={`relative rounded-md transition-colors ${isDragOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
            >
              {isDragOver && (
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div className="bg-background/90 border-2 border-dashed border-primary rounded-md px-6 py-4 text-sm">
                    Drop to upload
                  </div>
                </div>
              )}
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ImageOff className="h-10 w-10 mb-2" />
                  <p>No photos match these filters.</p>
                  <p className="text-xs mt-1">Drop image files here or click Upload.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filtered.map((p) => {
                    const usage = usageByUrl.get(p.url) ?? [];
                    const isSelected = selected.has(p.id);
                    return (
                      <div key={p.id}
                        className={`group relative aspect-square rounded-md overflow-hidden border transition-all ${
                          isSelected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary/50"
                        }`}>
                        <img src={p.url} alt={p.alt_text ?? p.original_filename ?? ""} loading="lazy"
                          className="w-full h-full object-cover cursor-pointer"
                          onError={() => setImageErrors((prev) => new Set(prev).add(p.id))}
                          onClick={() => toggleSelect(p.id)} />

                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                          className="absolute top-1.5 left-1.5">
                          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
                            isSelected ? "bg-primary border-primary" : "bg-background/80 border-background/80"
                          }`}>
                            {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                          </div>
                        </button>

                        {usage.length > 0 && (
                          <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0">
                            {usage.length} unit{usage.length > 1 ? "s" : ""}
                          </Badge>
                        )}

                        <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox(p); }}
                            className="bg-background/80 rounded p-1" title="Preview">
                            <ZoomIn className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(p); }}
                            className="bg-background/80 rounded p-1" title="Edit details">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); copyUrl(p.url); }}
                            className="bg-background/80 rounded p-1" title="Copy URL">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleSingleDownload(p); }}
                            className="bg-background/80 rounded p-1" title="Download">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
                          <p className="text-[10px] text-white truncate">{p.caption || p.original_filename || p.folder}</p>
                          {usage.length > 0 && (
                            <p className="text-[9px] text-white/80 truncate">{usage.map((x) => x.name).join(", ")}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New folder */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <Input placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              const n = newFolderName.trim();
              if (!n) return;
              setCustomFolders((p) => Array.from(new Set([...p, n])));
              setActiveFolder(n); setNewFolderName(""); setNewFolderOpen(false);
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload folder picker */}
      <Dialog open={uploadFolderOpen} onOpenChange={setUploadFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload {pendingFiles?.length ?? 0} photo(s)</DialogTitle>
            <DialogDescription>Choose a folder to upload into.</DialogDescription>
          </DialogHeader>
          <Select value={uploadFolder} onValueChange={setUploadFolder}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setUploadFolderOpen(false); setPendingFiles(null); }}>Cancel</Button>
            <Button onClick={handleConfirmUploadFolder}>Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate warning */}
      <Dialog open={!!duplicateWarning} onOpenChange={(o) => !o && setDuplicateWarning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate filenames</DialogTitle>
            <DialogDescription>
              The following file name(s) already exist in the library. Uploading creates new copies — the original files stay untouched.
            </DialogDescription>
          </DialogHeader>
          <ul className="text-sm list-disc pl-5 max-h-40 overflow-auto">
            {duplicateWarning?.duplicates.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDuplicateWarning(null)}>Cancel</Button>
            <Button onClick={() => {
              const files = duplicateWarning?.files ?? [];
              setDuplicateWarning(null);
              setPendingFiles(files);
              setUploadFolderOpen(true);
            }}>Upload anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move {selected.size} photo(s)</DialogTitle></DialogHeader>
          <Select value={moveTarget} onValueChange={setMoveTarget}>
            <SelectTrigger><SelectValue placeholder="Choose folder" /></SelectTrigger>
            <SelectContent>{folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkMove} disabled={!moveTarget || bulkFolder.isPending}>
              {bulkFolder.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign to unit */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selected.size} photo(s) to a unit</DialogTitle>
            <DialogDescription>Photos are appended to the unit's gallery.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-72 -mx-2 px-2">
            <div className="space-y-1">
              {(units ?? []).map((u) => (
                <label key={u.id} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent ${
                  assignTargetUnitId === u.id ? "bg-accent" : ""}`}>
                  <input type="radio" name="assign-unit" checked={assignTargetUnitId === u.id}
                    onChange={() => setAssignTargetUnitId(u.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{(u.photos ?? []).length} existing photo(s)</p>
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!assignTargetUnitId || updateUnit.isPending}>
              {updateUnit.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove from unit */}
      <Dialog open={removeUnitOpen} onOpenChange={setRemoveUnitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {selected.size} photo(s) from a unit</DialogTitle>
            <DialogDescription>Photos stay in the library; only the unit assignment is removed.</DialogDescription>
          </DialogHeader>
          <Select value={removeUnitId} onValueChange={setRemoveUnitId}>
            <SelectTrigger><SelectValue placeholder="Choose unit" /></SelectTrigger>
            <SelectContent>{(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveUnitOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkRemoveFromUnit} disabled={!removeUnitId || updateUnit.isPending}>
              {updateUnit.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit details */}
      {editing && (
        <EditAssetDialog
          asset={editing} folders={folders}
          onClose={() => setEditing(null)}
          onSave={async (updates) => {
            try {
              await updateAsset.mutateAsync({ id: editing.id, ...updates });
              toast({ title: "Saved" }); setEditing(null);
            } catch (err: unknown) {
              toast({ title: "Save failed", description: errorMessage(err), variant: "destructive" });
            }
          }}
        />
      )}

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl p-2">
          {lightbox && (
            <div className="space-y-2">
              <img src={lightbox.url} alt={lightbox.alt_text ?? ""} className="w-full max-h-[80vh] object-contain rounded" />
              <div className="px-2 pb-2 text-sm flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{lightbox.caption || lightbox.original_filename}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lightbox.folder} · {(lightbox.tags ?? []).join(", ") || "No tags"}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => handleSingleDownload(lightbox)}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Download progress — bottom-left so it never fights the upload tray */}
      {(zipProgress || singleDownload || failedBatch) && (
        <Card className="fixed bottom-4 left-4 z-50 w-[min(340px,calc(100vw-2rem))] p-3 space-y-2 shadow-2xl border-primary/30 bg-card/95 backdrop-blur">
          {zipProgress && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="truncate">
                  {zipProgress.phase === "zipping"
                    ? `Building zip… ${zipProgress.zipPercent ?? 0}%`
                    : zipProgress.phase === "saving"
                      ? "Saving zip to your device…"
                      : `${zipProgress.pass > 0 ? "Retrying" : "Downloading"} ${zipProgress.done} of ${zipProgress.total}…`}
                </span>
              </div>
              <Progress
                value={
                  zipProgress.phase === "zipping"
                    ? (zipProgress.zipPercent ?? 0)
                    : zipProgress.phase === "saving"
                      ? 100
                      : zipProgress.total ? (zipProgress.done / zipProgress.total) * 100 : 0
                }
                className="h-1.5"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {zipProgress.failed > 0
                    ? `${zipProgress.failed} missed so far — retried automatically.`
                    : "Keep this tab open until the zip saves."}
                </p>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                  onClick={() => zipAbortRef.current?.abort()}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {!zipProgress && singleDownload && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="truncate">
                  {singleDownload.saving ? "Saving…" : "Downloading photo…"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {singleDownload.name}
                {singleDownload.attempt > 1 && !singleDownload.saving
                  ? ` — retry ${singleDownload.attempt} of ${singleDownload.attempts}`
                  : ""}
              </p>
            </div>
          )}

          {!zipProgress && failedBatch && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-destructive">
                {failedBatch.rows.length} file{failedBatch.rows.length === 1 ? "" : "s"} didn't download
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => runZipDownload(failedBatch.rows, `${failedBatch.label}-retry`, 1)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Retry missed files
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFailedBatch(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

    </DashboardLayout>
  );
}

function FolderButton({ label, count, active, onClick, icon }: {
  label: string; count: number; active: boolean; onClick: () => void; icon: "all" | "unused" | "folder";
}) {
  const Icon = icon === "folder" ? Folder : icon === "unused" ? ImageOff : Filter;
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
        active ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-foreground"
      }`}>
      <span className="flex items-center gap-2 truncate"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function EditAssetDialog({ asset, folders, onClose, onSave }: {
  asset: PhotoRow; folders: string[]; onClose: () => void;
  onSave: (updates: Partial<MediaAsset>) => Promise<void>;
}) {
  const [caption, setCaption] = useState(asset.caption ?? "");
  const [altText, setAltText] = useState(asset.alt_text ?? "");
  const [folder, setFolder] = useState(asset.folder);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(asset.tags ?? []);
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    setTags((p) => [...p, t]); setTagInput("");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit photo details</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-[200px_1fr] gap-4">
          <img src={asset.url} alt="" className="w-full aspect-square object-cover rounded-md border" />
          <div className="space-y-3">
            <div>
              <Label>Folder</Label>
              <Select value={folder} onValueChange={setFolder}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Caption</Label>
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} />
            </div>
            <div>
              <Label>Alt text</Label>
              <Textarea value={altText} onChange={(e) => setAltText(e.target.value)} maxLength={300} rows={2} />
            </div>
            <div>
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="e.g. pool view, king bed" />
                <Button type="button" variant="outline" onClick={addTag}><Tag className="h-4 w-4" /></Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button onClick={() => setTags((p) => p.filter((x) => x !== t))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={async () => {
            setSaving(true);
            await onSave({ caption: caption || null, alt_text: altText || null, folder, tags });
            setSaving(false);
          }}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
