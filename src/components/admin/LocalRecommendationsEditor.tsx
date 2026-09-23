import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  useAllLocalRecommendations,
  useSaveLocalRecommendation,
  useMarkRecommendationReviewed,
  needsReview,
  daysSinceReview,
  type LocalRecommendation,
} from "@/hooks/useLocalRecommendations";

/**
 * The island guide editor.
 *
 * Who can do what:
 * - Managers and admins write and edit entries (database policies enforce this).
 * - Only an admin flips "Published", so nothing reaches guests without admin sign-off.
 * - "Mark checked" is a deliberate, separate action — editing a description
 *   doesn't silently claim someone verified the phone number.
 *
 * Nothing is generated. Every field is typed by a person at the camp.
 */

const CATEGORIES = [
  "food",
  "beach",
  "attraction",
  "essentials",
  "transport",
  "recovery",
  "training",
  "etiquette",
] as const;

const EMPTY = {
  name: "",
  category: "food",
  description: "",
  address: "",
  maps_url: "",
  phone: "",
  whatsapp: "",
  website: "",
  opening_hours: "",
  distance_note: "",
  seasonal_note: "",
  staff_notes: "",
  closed_temporarily: false,
  is_active: true,
  featured: false,
  sort_order: 0,
};

type Draft = typeof EMPTY;

function toDraft(r: LocalRecommendation): Draft {
  return {
    name: r.name,
    category: r.category,
    description: r.description ?? "",
    address: r.address ?? "",
    maps_url: r.maps_url ?? "",
    phone: r.phone ?? "",
    whatsapp: r.whatsapp ?? "",
    website: r.website ?? "",
    opening_hours: r.opening_hours ?? "",
    distance_note: r.distance_note ?? "",
    seasonal_note: r.seasonal_note ?? "",
    staff_notes: r.staff_notes ?? "",
    closed_temporarily: r.closed_temporarily,
    is_active: r.is_active ?? true,
    featured: r.featured ?? false,
    sort_order: r.sort_order ?? 0,
  };
}

export function LocalRecommendationsEditor() {
  const { isAdmin } = useAuth();
  const { data, isLoading } = useAllLocalRecommendations();
  const save = useSaveLocalRecommendation();
  const markReviewed = useMarkRecommendationReviewed();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);

  const startNew = () => {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  };

  const startEdit = (r: LocalRecommendation) => {
    setEditing(r.id);
    setDraft(toDraft(r));
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.name.trim() || draft.name.trim().length < 2) {
      toast.error("Give the place a name.");
      return;
    }
    try {
      await save.mutateAsync({
        id: editing ?? undefined,
        values: {
          ...draft,
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          address: draft.address.trim() || null,
          maps_url: draft.maps_url.trim() || null,
          phone: draft.phone.trim() || null,
          whatsapp: draft.whatsapp.trim() || null,
          website: draft.website.trim() || null,
          opening_hours: draft.opening_hours.trim() || null,
          distance_note: draft.distance_note.trim() || null,
          seasonal_note: draft.seasonal_note.trim() || null,
          staff_notes: draft.staff_notes.trim() || null,
        } as any,
      });
      toast.success(editing ? "Entry updated." : "Entry added.");
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save that entry.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Around Lamai</CardTitle>
          <CardDescription>
            Places the camp recommends. Guests only see entries an admin has published, and every
            entry shows the date it was last checked.
          </CardDescription>
        </div>
        <Button size="sm" onClick={startNew}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : !data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing here yet. Guests see no guide until someone writes one.
          </p>
        ) : (
          data.map((r) => {
            const stale = needsReview(r);
            const since = daysSinceReview(r);
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <span className="font-medium">{r.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {r.category}
                </Badge>
                {r.featured && r.is_active ? (
                  <Badge className="text-[10px]">Published</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Draft
                  </Badge>
                )}
                {r.closed_temporarily && (
                  <Badge variant="secondary" className="text-[10px]">
                    Closed
                  </Badge>
                )}
                {stale && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {since === null ? "never checked" : `checked ${since}d ago`}
                  </span>
                )}
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => markReviewed.mutate(r.id)}
                    disabled={markReviewed.isPending}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Mark checked
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => startEdit(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="sr-only">Edit {r.name}</span>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit entry" : "New entry"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lr-name">Name</Label>
              <Input
                id="lr-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lr-category">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(v) => setDraft({ ...draft, category: v })}
              >
                <SelectTrigger id="lr-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lr-desc">What guests should know</Label>
              <Textarea
                id="lr-desc"
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lr-hours">Opening hours</Label>
                <Input
                  id="lr-hours"
                  value={draft.opening_hours}
                  onChange={(e) => setDraft({ ...draft, opening_hours: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lr-distance">Distance from camp</Label>
                <Input
                  id="lr-distance"
                  value={draft.distance_note}
                  onChange={(e) => setDraft({ ...draft, distance_note: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lr-phone">Phone</Label>
                <Input
                  id="lr-phone"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lr-whatsapp">WhatsApp</Label>
                <Input
                  id="lr-whatsapp"
                  value={draft.whatsapp}
                  onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lr-maps">Map link</Label>
                <Input
                  id="lr-maps"
                  placeholder="https://maps.google.com/…"
                  value={draft.maps_url}
                  onChange={(e) => setDraft({ ...draft, maps_url: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lr-web">Website</Label>
                <Input
                  id="lr-web"
                  value={draft.website}
                  onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lr-season">Seasonal note (shown to guests)</Label>
              <Input
                id="lr-season"
                value={draft.seasonal_note}
                onChange={(e) => setDraft({ ...draft, seasonal_note: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lr-staff">Internal note (staff only)</Label>
              <Textarea
                id="lr-staff"
                rows={2}
                value={draft.staff_notes}
                onChange={(e) => setDraft({ ...draft, staff_notes: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="lr-closed" className="text-sm">
                Temporarily closed
              </Label>
              <Switch
                id="lr-closed"
                checked={draft.closed_temporarily}
                onCheckedChange={(v) => setDraft({ ...draft, closed_temporarily: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="lr-pub" className="text-sm">
                  Published to guests
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Admins only." : "An admin has to publish this."}
                </p>
              </div>
              <Switch
                id="lr-pub"
                disabled={!isAdmin}
                checked={draft.featured && draft.is_active}
                onCheckedChange={(v) => setDraft({ ...draft, featured: v, is_active: v || draft.is_active })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
