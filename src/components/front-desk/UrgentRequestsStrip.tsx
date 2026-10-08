import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Siren } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { URGENT_CATEGORIES, useOpenUrgentRequests, useUrgentRequestAction } from "@/hooks/useUrgentAssistance";

const label = (c: string | null) => URGENT_CATEGORIES.find((x) => x.value === c)?.label ?? c ?? "Other";

/** Open guest urgent requests. Acknowledge ≠ resolve; resolve needs a note. */
export function UrgentRequestsStrip({ onOpen }: { onOpen?: (bookingId: string) => void }) {
  const { data } = useOpenUrgentRequests();
  const act = useUrgentRequestAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!data || data.length === 0) return null;

  const run = async (id: string, action: "acknowledge" | "addressed" | "resolve" | "spam") => {
    try {
      await act.mutateAsync({ id, action, note: notes[id] });
      toast.success(action === "acknowledge" ? "Acknowledged — still open until resolved." : "Updated.");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't update");
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Siren className="h-4 w-4 text-destructive" /> Urgent guest requests ({data.length})
        </div>
        {data.map((r: any) => (
          <div key={r.id} className="rounded-md border border-border p-2 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">{label(r.category)}</Badge>
              <Badge variant="outline">{r.status}</Badge>
              {r.high_volume && <Badge variant="secondary">high volume</Badge>}
              <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
              {r.booking_id && onOpen && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onOpen(r.booking_id)}>Open booking</Button>
              )}
            </div>
            {r.details && <p className="text-xs break-anywhere">{r.details}</p>}
            <div className="flex flex-wrap gap-2">
              {!r.acknowledged_at && <Button size="sm" onClick={() => run(r.id, "acknowledge")}>Acknowledge</Button>}
              {!r.addressed_at && <Button size="sm" variant="outline" onClick={() => run(r.id, "addressed")}>Mark physically addressed</Button>}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Resolution note (required)" value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
              <Button size="sm" variant="secondary" disabled={!notes[r.id]?.trim()} onClick={() => run(r.id, "resolve")}>Resolve</Button>
              <Button size="sm" variant="ghost" disabled={!notes[r.id]?.trim()} onClick={() => run(r.id, "spam")}>Spam</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
