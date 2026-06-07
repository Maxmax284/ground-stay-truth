import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";

/**
 * Admin-only banner control that lets an admin choose any guest with bookings
 * and view the Guest Portal AS that guest. Read-only — writes are gated
 * separately in the portal.
 *
 * Activates whenever ?preview=true. Picking a guest appends ?as=<user_id>.
 */
export function GuestPreviewControls() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewAs = searchParams.get("as");

  // Pull distinct guests who have at least one booking. Admin RLS allows this.
  const { data: guests } = useQuery({
    queryKey: ["admin-preview-guests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("guest_id, profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .not("guest_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set<string>();
      const out: { id: string; label: string }[] = [];
      for (const row of (data ?? []) as any[]) {
        if (!row.guest_id || seen.has(row.guest_id)) continue;
        seen.add(row.guest_id);
        const name = row.profiles?.full_name?.trim() || row.profiles?.email || "Guest";
        out.push({ id: row.guest_id, label: name });
      }
      return out.sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const currentLabel = useMemo(() => {
    if (!viewAs) return null;
    return guests?.find((g) => g.id === viewAs)?.label ?? "Selected guest";
  }, [viewAs, guests]);

  const setAs = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "__self__") next.delete("as");
    else next.set("as", value);
    next.set("preview", "true");
    setSearchParams(next, { replace: true });
  };

  const clear = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("as");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-warning-foreground">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          {viewAs
            ? <>Viewing as <strong>{currentLabel}</strong> — read-only. Actions are disabled.</>
            : <>Admin preview. Pick a guest below to view their actual portal exactly as they see it.</>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <Select value={viewAs ?? "__self__"} onValueChange={setAs}>
            <SelectTrigger className="h-9 bg-background">
              <SelectValue placeholder="View as guest…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__self__">— My own admin view —</SelectItem>
              {(guests ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
              ))}
              {!guests?.length && (
                <SelectItem value="__none__" disabled>No guests found</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        {viewAs && (
          <Button variant="outline" size="sm" onClick={clear} className="h-9">
            <X className="h-3.5 w-3.5 mr-1" /> Exit guest view
          </Button>
        )}
      </div>
    </div>
  );
}
