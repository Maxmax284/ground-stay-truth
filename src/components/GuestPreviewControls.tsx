import { useEffect, useMemo, useRef } from "react";
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
  const { data: guestData } = useQuery({
    queryKey: ["admin-preview-guests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("guest_id, check_in, state, profiles!bookings_guest_id_profiles_fkey(full_name, email)")
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
      // Default pick: the active stay closest to today (checked in, arriving, or upcoming).
      const now = Date.now();
      const active = ((data ?? []) as any[])
        .filter((r) => r.guest_id && ["checked_in", "confirmed", "pending_deposit"].includes(r.state))
        .sort((a, b) => Math.abs(new Date(a.check_in).getTime() - now) - Math.abs(new Date(b.check_in).getTime() - now));
      const defaultId = active[0]?.guest_id ?? out[0]?.id ?? null;
      return { list: out.sort((a, b) => a.label.localeCompare(b.label)), defaultId };
    },
  });

  const guests = guestData?.list;
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || viewAs || !guestData?.defaultId) return;
    autoPicked.current = true;
    const next = new URLSearchParams(searchParams);
    next.set("as", guestData.defaultId);
    next.set("preview", "true");
    setSearchParams(next, { replace: true });
  }, [guestData, viewAs, searchParams, setSearchParams]);

  const currentLabel = useMemo(() => {
    if (!viewAs) return null;
    return guests?.find((g) => g.id === viewAs)?.label ?? "Selected guest";
  }, [viewAs, guests]);

  const setAs = (value: string) => {
    const next = new URLSearchParams(searchParams);
    autoPicked.current = true;
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
    <div className="preview-ticket flex min-w-0 max-w-full flex-col gap-2 overflow-hidden rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
      <div className="flex items-start gap-2 text-warning-foreground">
        <Eye className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="min-w-0 break-words">
          {viewAs
            ? <>Viewing as <strong>{currentLabel}</strong> · read-only · audit-logged<span className="hidden sm:inline">. To make changes on this guest's behalf, do it from the Bookings page.</span></>
            : <>Admin preview. Pick a guest below to see their actual portal exactly as they see it (read-only).</>}
        </span>
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select value={viewAs ?? "__self__"} onValueChange={setAs}>
            <SelectTrigger className="h-9 min-w-0 bg-background">
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
          <Button variant="outline" size="sm" onClick={clear} className="h-9 shrink-0 px-2 sm:px-3" aria-label="Exit guest view">
            <X className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Exit guest view</span>
          </Button>
        )}
      </div>
    </div>
  );
}
