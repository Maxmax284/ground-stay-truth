// NotificationPreferencesPanel — per-user toggles for messaging notifications
// across linked channels. Used in /stay (guests) and Settings (staff).
//
// Shows only the bindings + prefs that already exist for the user; preferences
// are auto-seeded with role-based defaults when a chat is linked.

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

const NOTIFICATION_LABELS: Record<string, string> = {
  booking_confirmed: "Booking confirmed",
  payment_receipt: "Payment receipt",
  checkin_instructions_24h: "Check-in reminder (24h)",
  booking_approval_needed: "Approvals needed",
  payment_received: "Payment received",
  new_review: "New review",
  security_alert: "Security alert",
  new_inquiry: "New inquiry",
  booking_state_change: "Booking state change",
  daily_briefing: "Daily briefing",
  checkin_due: "Check-in due",
  checkout_due: "Check-out due",
  booking_approved: "Booking approved",
  assigned_booking_update: "Assigned booking update",
  guest_arrival_change: "Guest arrival change",
  task_assigned: "Task assigned",
  urgent_issue: "Urgent issue",
};

const CHANNEL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

export function NotificationPreferencesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: bindings } = useQuery({
    queryKey: ["my-chat-bindings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messaging_chat_bindings")
        .select("id, channel, chat_id, display_name, last_seen_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: prefs } = useQuery({
    queryKey: ["my-notification-prefs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messaging_notification_prefs")
        .select("id, channel, notification_type, enabled")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const togglePref = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("messaging_notification_prefs")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notification-prefs", user?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messaging_chat_bindings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Channel disconnected");
      qc.invalidateQueries({ queryKey: ["my-chat-bindings", user?.id] });
      qc.invalidateQueries({ queryKey: ["my-notification-prefs", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!bindings?.length) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
        <BellOff className="h-3.5 w-3.5" />
        Link a channel above to receive notifications.
      </div>
    );
  }

  // Group prefs by channel
  const byChannel = (bindings ?? []).map((b) => ({
    binding: b,
    prefs: (prefs ?? []).filter((p) => p.channel === b.channel),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">Notification preferences</h4>
      </div>

      {byChannel.map(({ binding, prefs: channelPrefs }) => (
        <div key={binding.id} className="rounded-md border p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{CHANNEL_LABELS[binding.channel] ?? binding.channel}</Badge>
              <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                {binding.display_name || binding.chat_id}
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              onClick={() => unlink.mutate(binding.id)}
              disabled={unlink.isPending}
              title="Disconnect this channel"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {channelPrefs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No preferences yet — they'll appear after the next event.</p>
          ) : (
            <div className="space-y-1.5">
              {channelPrefs.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <Label htmlFor={`pref-${p.id}`} className="text-xs font-normal text-foreground cursor-pointer flex-1">
                    {NOTIFICATION_LABELS[p.notification_type] ?? p.notification_type}
                  </Label>
                  <Switch
                    id={`pref-${p.id}`}
                    checked={p.enabled}
                    onCheckedChange={(checked) => togglePref.mutate({ id: p.id, enabled: checked })}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
