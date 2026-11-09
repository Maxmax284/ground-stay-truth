import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GuestNameEditor({ guestId, bookingId, name, account = false }: {
  guestId?: string | null; bookingId?: string; name: string; account?: boolean;
}) {
  const { role } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const label = account
    ? t("guestIdentity.accountName", { defaultValue: "Account owner name" })
    : t("guestIdentity.bookingName", { defaultValue: "Guest staying in this room" });
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("staff_edit_guest_identity", {
        _guest_id: account ? guestId : undefined,
        _booking_id: account ? undefined : bookingId,
        _full_name: draft.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all(["guest-directory", "guest-bookings", "bookings", "booking", "front-desk", "profile"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setEditing(false);
      toast.success(t("guestIdentity.saved", { defaultValue: "Name saved" }));
    },
    onError: () => toast.error(t("guestIdentity.failed", { defaultValue: "Could not save name. Check your access and try again." })),
  });
  if (!(role === "admin" || role === "manager") || (account && !guestId)) return null;
  if (!editing) return (
    <Button size="sm" variant="outline" onClick={() => { setDraft(name); setEditing(true); }}>
      <Pencil className="mr-2 h-4 w-4" />{account
        ? t("guestIdentity.editAccount", { defaultValue: "Edit account name" })
        : t("guestIdentity.editBooking", { defaultValue: "Edit booking guest" })}
    </Button>
  );
  const id = `guest-name-${bookingId ?? guestId}`;
  return (
    <div className="w-full space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={draft} maxLength={255} onChange={e => setDraft(e.target.value)} disabled={mutation.isPending} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!draft.trim() || mutation.isPending} onClick={() => mutation.mutate()}><Check className="mr-2 h-4 w-4" />{t("guestIdentity.save", { defaultValue: "Save name" })}</Button>
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setEditing(false)}><X className="mr-2 h-4 w-4" />{t("guestIdentity.cancel", { defaultValue: "Keep current name" })}</Button>
      </div>
    </div>
  );
}