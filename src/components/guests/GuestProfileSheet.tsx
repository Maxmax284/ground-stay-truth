/**
 * Guest Profile sheet — one person's full operational history.
 * Read-only aggregate + staff notes + admin merge entry point.
 */
import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Phone, Merge, Copy } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/currency";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useAuth } from "@/hooks/useAuth";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import {
  useGuestBookings, useGuestNotes, useAddGuestNote,
  type GuestDirectoryRow,
} from "@/hooks/useGuestDirectory";

interface Props {
  guest: GuestDirectoryRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenBooking: (id: string) => void;
  onMerge: (g: GuestDirectoryRow) => void;
}

export function GuestProfileSheet({ guest, open, onOpenChange, onOpenBooking, onMerge }: Props) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { data: policies } = usePolicySettings();
  const { data: stays, isLoading } = useGuestBookings(guest?.guest_key ?? null);
  const { data: notes } = useGuestNotes(guest?.guest_key ?? null);
  const addNote = useAddGuestNote();
  const [note, setNote] = useState("");

  const canNote = role === "admin" || role === "manager" || role === "front_desk_supervisor";

  const copy = (v?: string | null) => {
    if (!v) return;
    navigator.clipboard.writeText(v);
    toast.success(t("guests.copied"));
  };

  const submitNote = async () => {
    if (!guest || !note.trim()) return;
    try {
      await addNote.mutateAsync({ guestKey: guest.guest_key, guestId: guest.guest_id, note: note.trim() });
      setNote("");
      toast.success(t("guests.noteAdded"));
    } catch { toast.error(t("guests.noteFailed")); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="truncate">{guest?.full_name ?? t("bookings.guest")}</SheetTitle>
        </SheetHeader>

        {guest && (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap gap-2">
              {guest.is_linked
                ? <Badge variant="secondary">{t("guests.registered")}</Badge>
                : <Badge variant="outline">{t("guests.manualRecord")}</Badge>}
              {guest.in_house && <Badge className={STATE_VARIANTS.checked_in}>{t("guests.status.in_house")}</Badge>}
              {guest.outstanding_balance > 0 && (
                <Badge variant="destructive">{t("guests.owes", { amount: formatPrice(guest.outstanding_balance, policies) })}</Badge>
              )}
            </div>

            <div className="space-y-1 text-sm">
              {guest.email && (
                <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={() => copy(guest.email)}>
                  <Mail className="h-3.5 w-3.5" /> <span className="truncate">{guest.email}</span> <Copy className="h-3 w-3" />
                </button>
              )}
              {guest.phone && (
                <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={() => copy(guest.phone)}>
                  <Phone className="h-3.5 w-3.5" /> <span>{guest.phone}</span> <Copy className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label={t("guests.stays")} value={String(guest.completed_stays)} />
              <Stat label={t("guests.nights")} value={String(guest.total_nights)} />
              <Stat label={t("guests.lifetimeSpend")} value={formatPrice(guest.lifetime_spend, policies, { decimals: 0 })} />
              <Stat label={t("guests.outstanding")} value={formatPrice(guest.outstanding_balance, policies, { decimals: 0 })} />
            </div>

            {role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => onMerge(guest)}>
                <Merge className="h-4 w-4 mr-2" /> {t("guests.mergeAction")}
              </Button>
            )}

            <Tabs defaultValue="stays">
              <TabsList>
                <TabsTrigger value="stays">{t("guests.tabStays")}</TabsTrigger>
                <TabsTrigger value="notes">{t("guests.tabNotes")}</TabsTrigger>
              </TabsList>

              <TabsContent value="stays" className="space-y-2 pt-3">
                {isLoading ? (
                  [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : !stays?.length ? (
                  <p className="text-sm text-muted-foreground">{t("guests.noStays")}</p>
                ) : stays.map((s) => (
                  <button
                    key={s.booking_id}
                    onClick={() => onOpenBooking(s.booking_id)}
                    className="w-full text-left rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.unit_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(s.check_in), "MMM d, yyyy")} – {format(new Date(s.check_out), "MMM d, yyyy")}
                          {s.confirmation_number ? ` · ${s.confirmation_number}` : ""}
                        </p>
                      </div>
                      <Badge className={STATE_VARIANTS[s.state as BookingState]}>{t(`states.${s.state}`)}</Badge>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <span>{t("guests.total")}: {formatPrice(s.total_price, policies, { decimals: 0 })}</span>
                      <span>{t("guests.paid")}: {formatPrice(s.paid, policies, { decimals: 0 })}</span>
                      {s.owed > 0 && <span className="text-destructive">{t("guests.owed")}: {formatPrice(s.owed, policies, { decimals: 0 })}</span>}
                    </div>
                  </button>
                ))}
              </TabsContent>

              <TabsContent value="notes" className="space-y-3 pt-3">
                {canNote && (
                  <div className="space-y-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("guests.notePlaceholder")}
                      rows={3}
                    />
                    <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={submitNote}>
                      {t("guests.addNote")}
                    </Button>
                  </div>
                )}
                {!notes?.length ? (
                  <p className="text-sm text-muted-foreground">{t("guests.noNotes")}</p>
                ) : notes.map((n: any) => (
                  <div key={n.id} className="rounded-lg border bg-card p-3">
                    <p className="text-sm whitespace-pre-wrap">{n.note}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {format(new Date(n.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
