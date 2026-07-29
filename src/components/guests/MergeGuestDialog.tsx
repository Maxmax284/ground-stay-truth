/**
 * Admin-only duplicate merge. Source record folds into a registered guest
 * account; all bookings reassign and the action is written to the staff audit
 * trail by `merge_guest_records()`.
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMergeGuests, type GuestDirectoryRow } from "@/hooks/useGuestDirectory";

interface Props {
  source: GuestDirectoryRow | null;
  candidates: GuestDirectoryRow[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function MergeGuestDialog({ source, candidates, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const merge = useMergeGuests();
  const [search, setSearch] = useState("");
  const [targetKey, setTargetKey] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const targets = candidates
    .filter((c) => c.is_linked && c.guest_key !== source?.guest_key)
    .filter((c) => !q || `${c.full_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q))
    .slice(0, 8);

  const run = async () => {
    if (!source || !targetKey) return;
    try {
      const moved = await merge.mutateAsync({ sourceKey: source.guest_key, targetKey });
      toast.success(t("guests.mergeDone", { count: moved }));
      onOpenChange(false);
      setTargetKey(null);
      setSearch("");
    } catch (e: any) {
      toast.error(e?.message ?? t("guests.mergeFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("guests.mergeTitle")}</DialogTitle>
          <DialogDescription>
            {t("guests.mergeDescription", { name: source?.full_name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("guests.mergeSearchPlaceholder")}
        />

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {targets.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("guests.noMergeTargets")}</p>
          )}
          {targets.map((c) => (
            <button
              key={c.guest_key}
              onClick={() => setTargetKey(c.guest_key)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                targetKey === c.guest_key ? "border-primary bg-accent/50" : "hover:bg-accent/30"
              }`}
            >
              <p className="text-sm font-medium truncate">{c.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {c.email ?? c.phone ?? "—"} · {t("guests.bookingsCount", { count: c.total_bookings })}
              </p>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={!targetKey || merge.isPending} onClick={run}>
            {t("guests.confirmMerge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
