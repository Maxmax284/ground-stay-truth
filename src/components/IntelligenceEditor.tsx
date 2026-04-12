import { useState } from "react";
import { useIntelligence, useIntelligenceMutations, type IntelligenceEntry, type IntelligenceCategory, type IntelligenceType, type IntelligenceStatus, type IntelligenceSeverity } from "@/hooks/useIntelligence";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ArrowUpCircle, Zap, BookOpen, Archive, Sparkles, Loader2, Radar, ImageIcon, ImageOff } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES: { value: IntelligenceCategory; label: string }[] = [
  { value: "money", label: "Money & ATMs" },
  { value: "transport", label: "Transport" },
  { value: "safety", label: "Safety" },
  { value: "connectivity", label: "Connectivity" },
  { value: "customs", label: "Customs & Entry" },
  { value: "health", label: "Health" },
  { value: "local_life", label: "Local Life" },
];

const LOCATIONS = [
  { value: "global", label: "Everywhere" },
  { value: "bkk", label: "Bangkok (BKK)" },
  { value: "samui", label: "Koh Samui" },
  { value: "nathon", label: "Nathon Pier" },
  { value: "lipa_noi", label: "Lipa Noi Pier" },
  { value: "phuket", label: "Phuket" },
  { value: "pattaya", label: "Pattaya" },
  { value: "transit", label: "In Transit" },
  { value: "bus", label: "Bus Route" },
  { value: "island", label: "Island General" },
];

const STATUS_COLORS: Record<IntelligenceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  archived: "bg-muted text-muted-foreground/50",
};

export function IntelligenceEditor() {
  const { user, session } = useAuth();
  const { data: entries, isLoading } = useIntelligence();
  const { upsert, remove, promote } = useIntelligenceMutations();
  const [editEntry, setEditEntry] = useState<Partial<IntelligenceEntry> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "heads_up" | "playbook">("all");
  const [generating, setGenerating] = useState(false);
  const [lookoutScanning, setLookoutScanning] = useState(false);
  const [lookoutDrafts, setLookoutDrafts] = useState<Partial<IntelligenceEntry>[]>([]);

  const filtered = (entries ?? []).filter((e) => filter === "all" || e.type === filter);

  const openNew = () => {
    setEditEntry({
      type: "heads_up",
      status: "draft",
      title: "",
      body: "",
      category: "money",
      location: ["global"],
      audience: ["guest", "staff"],
      severity: "normal",
      image_url: null,
      image_caption: null,
    });
    setDialogOpen(true);
  };

  const openEdit = (entry: IntelligenceEntry) => {
    setEditEntry({ ...entry });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editEntry?.title?.trim() || !editEntry?.body?.trim()) {
      toast.error("Title and body are required");
      return;
    }
    try {
      await upsert.mutateAsync({
        ...editEntry,
        created_by: editEntry.id ? editEntry.created_by : user?.id,
        approved_by: editEntry.status === "active" ? user?.id : editEntry.approved_by,
      } as any);
      toast.success(editEntry.id ? "Entry updated" : "Entry created");
      setDialogOpen(false);
      setEditEntry(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const handlePromote = async (id: string) => {
    try {
      await promote.mutateAsync(id);
      toast.success("Promoted to Playbook — Heads Up archived");
    } catch (err: any) {
      toast.error(err.message || "Failed to promote");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success("Entry deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleGenerateDraft = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            message: "Based on common guest issues and operational patterns, suggest ONE new intelligence entry. Return ONLY valid JSON with keys: type (heads_up or playbook), title, body, category (money|transport|safety|connectivity|customs|health|local_life), location (array from bkk/samui/nathon/lipa_noi/phuket/pattaya/transit/bus/island/global), severity (normal|attention|urgent). Keep body under 200 characters, practical and direct. No markdown, no explanation — just the JSON object.",
            mode: "draft",
          }),
        }
      );

      if (!resp.ok) throw new Error("AI request failed");
      const data = await resp.json();
      const aiText = data.reply || data.content || "";

      // Try to parse JSON from the response
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No valid JSON in AI response");

      const suggested = JSON.parse(jsonMatch[0]);

      // Open as draft for admin review
      setEditEntry({
        type: suggested.type === "playbook" ? "playbook" : "heads_up",
        status: "draft", // ALWAYS draft — admin must approve
        title: suggested.title || "",
        body: suggested.body || "",
        category: suggested.category || "local_life",
        location: Array.isArray(suggested.location) ? suggested.location : ["global"],
        audience: ["guest", "staff"],
        severity: suggested.severity || "normal",
        image_url: null,
        image_caption: null,
      });
      setDialogOpen(true);
      toast.info("AI suggestion loaded as draft — review and edit before publishing");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate suggestion");
    } finally {
      setGenerating(false);
    }
  };

  const handleLookoutScan = async () => {
    if (!session) return;
    setLookoutScanning(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            message: `Analyze common guest pain points for Thailand travel (ATMs, transport, connectivity, safety, customs, health). Suggest 3 NEW intelligence entries that would help guests. Return ONLY a JSON array of objects with keys: type (heads_up or playbook), title, body (under 200 chars), category (money|transport|safety|connectivity|customs|health|local_life), location (array from bkk/samui/nathon/lipa_noi/phuket/pattaya/transit/bus/island/global), severity (normal|attention|urgent). No markdown, no explanation — just the JSON array.`,
            mode: "draft",
          }),
        }
      );

      if (!resp.ok) throw new Error("AI request failed");
      const data = await resp.json();
      const aiText = data.reply || data.content || "";

      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No valid JSON array in AI response");

      const suggestions = JSON.parse(jsonMatch[0]);
      const drafts = suggestions.map((s: any) => ({
        type: s.type === "playbook" ? "playbook" : "heads_up",
        status: "draft" as const,
        title: s.title || "",
        body: s.body || "",
        category: s.category || "local_life",
        location: Array.isArray(s.location) ? s.location : ["global"],
        audience: ["guest", "staff"],
        severity: s.severity || "normal",
        image_url: null,
        image_caption: null,
      }));

      setLookoutDrafts(drafts);
      toast.info(`Lookout found ${drafts.length} suggestions — review below`);
    } catch (err: any) {
      toast.error(err.message || "Lookout scan failed");
    } finally {
      setLookoutScanning(false);
    }
  };

  const loadLookoutDraft = (draft: Partial<IntelligenceEntry>) => {
    setEditEntry({ ...draft });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entries</SelectItem>
              <SelectItem value="heads_up">Heads Up</SelectItem>
              <SelectItem value="playbook">Playbook</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleGenerateDraft} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {generating ? "Generating…" : "Suggest Draft"}
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> New Entry
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No intelligence entries yet</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <Card key={entry.id} className={entry.status === "archived" ? "opacity-60" : ""}>
              <CardContent className="flex items-start gap-3 py-3 px-4">
                <span className="mt-0.5 shrink-0">
                  {entry.type === "heads_up" ? <Zap className="h-4 w-4 text-amber-500" /> : <BookOpen className="h-4 w-4 text-primary" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{entry.title}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[entry.status]}`}>
                      {entry.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{entry.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.body}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {entry.location?.map((loc) => (
                      <span key={loc} className="text-[10px] text-muted-foreground">{loc}</span>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      → {entry.audience?.join(", ")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {entry.type === "heads_up" && entry.status === "active" && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handlePromote(entry.id)} disabled={promote.isPending}>
                      <ArrowUpCircle className="h-3.5 w-3.5 mr-1" /> Promote
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(entry)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{entry.title}"?</AlertDialogTitle>
                        <AlertDialogDescription>This permanently removes this intelligence entry.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(entry.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Lookout Layer — Admin-only draft suggestion system */}
      <Card className="border-dashed">
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Lookout</span>
              <span className="text-xs text-muted-foreground">Pattern detection</span>
            </div>
            <Button size="sm" variant="outline" onClick={handleLookoutScan} disabled={lookoutScanning}>
              {lookoutScanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Radar className="h-4 w-4 mr-1" />}
              {lookoutScanning ? "Scanning…" : "Scan for Patterns"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Analyzes common guest pain points and suggests draft entries. Nothing is published — all suggestions require your review and approval.
          </p>
          {lookoutDrafts.length > 0 && (
            <div className="space-y-2">
              {lookoutDrafts.map((draft, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md border border-dashed bg-muted/20">
                  <span className="mt-0.5 shrink-0">
                    {draft.type === "heads_up" ? <Zap className="h-3.5 w-3.5 text-amber-500" /> : <BookOpen className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{draft.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{draft.body}</p>
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{draft.category}</Badge>
                      {draft.location?.slice(0, 2).map((loc) => (
                        <Badge key={loc} variant="outline" className="text-[10px] px-1 py-0">{loc}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={() => loadLookoutDraft(draft)}>
                    Review
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEntry?.id ? "Edit Entry" : "New Intelligence Entry"}</DialogTitle>
          </DialogHeader>
          {editEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={editEntry.type || "heads_up"} onValueChange={(v) => setEditEntry({ ...editEntry, type: v as IntelligenceType })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="heads_up">⚡ Heads Up</SelectItem>
                      <SelectItem value="playbook">📖 Playbook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={editEntry.status || "draft"} onValueChange={(v) => setEditEntry({ ...editEntry, status: v as IntelligenceStatus })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active (Published)</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Title</Label>
                <Input value={editEntry.title || ""} onChange={(e) => setEditEntry({ ...editEntry, title: e.target.value })} placeholder="ATM: Press NO on currency conversion" className="h-8 text-sm" />
              </div>

              <div>
                <Label className="text-xs">Body (keep it short and direct)</Label>
                <Textarea value={editEntry.body || ""} onChange={(e) => setEditEntry({ ...editEntry, body: e.target.value })} placeholder="Yellow ATMs (Krungsri) attached to banks have lower fees..." className="text-sm min-h-[80px]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={editEntry.category || "money"} onValueChange={(v) => setEditEntry({ ...editEntry, category: v as IntelligenceCategory })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Severity</Label>
                  <Select value={editEntry.severity || "normal"} onValueChange={(v) => setEditEntry({ ...editEntry, severity: v as IntelligenceSeverity })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="attention">Attention</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Locations</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {LOCATIONS.map((loc) => (
                    <label key={loc.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={(editEntry.location || []).includes(loc.value)}
                        onCheckedChange={(checked) => {
                          const current = editEntry.location || [];
                          setEditEntry({
                            ...editEntry,
                            location: checked ? [...current, loc.value] : current.filter((l) => l !== loc.value),
                          });
                        }}
                      />
                      {loc.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Audience</Label>
                <div className="flex gap-4 mt-1">
                  {["guest", "staff"].map((a) => (
                    <label key={a} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={(editEntry.audience || []).includes(a)}
                        onCheckedChange={(checked) => {
                          const current = editEntry.audience || [];
                          setEditEntry({
                            ...editEntry,
                            audience: checked ? [...current, a] : current.filter((x) => x !== a),
                          });
                        }}
                      />
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Image URL (optional)</Label>
                <Input value={editEntry.image_url || ""} onChange={(e) => setEditEntry({ ...editEntry, image_url: e.target.value || null })} placeholder="https://..." className="h-8 text-sm" />
              </div>

              {editEntry.image_url && (
                <div>
                  <Label className="text-xs">Image Caption</Label>
                  <Input value={editEntry.image_caption || ""} onChange={(e) => setEditEntry({ ...editEntry, image_caption: e.target.value || null })} placeholder="Yellow Krungsri ATM attached to branch" className="h-8 text-sm" />
                </div>
              )}

              {editEntry.type === "heads_up" && (
                <div>
                  <Label className="text-xs">Expires At (optional)</Label>
                  <Input type="datetime-local" value={editEntry.expires_at?.slice(0, 16) || ""} onChange={(e) => setEditEntry({ ...editEntry, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="h-8 text-sm" />
                </div>
              )}

              <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
                {upsert.isPending ? "Saving…" : editEntry.id ? "Update Entry" : "Create Entry"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
