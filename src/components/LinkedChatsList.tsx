// LinkedChatsList — admin view of all guest/staff messaging chats currently
// bound to user accounts. One-click unlink per row. Rendered inside the
// Messaging Bridge settings panel.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Link as LinkIcon, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Binding = {
  id: string;
  user_id: string;
  channel: string;
  chat_id: string;
  display_name: string | null;
  created_at: string;
  last_seen_at: string;
};

type ProfileLite = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

export function LinkedChatsList() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["messaging_chat_bindings_admin"],
    queryFn: async () => {
      const { data: bindings, error: bErr } = await supabase
        .from("messaging_chat_bindings")
        .select("id, user_id, channel, chat_id, display_name, created_at, last_seen_at")
        .order("created_at", { ascending: false });
      if (bErr) throw bErr;
      const list = (bindings ?? []) as Binding[];

      const userIds = Array.from(new Set(list.map((b) => b.user_id)));
      let profiles: ProfileLite[] = [];
      if (userIds.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        if (pErr) throw pErr;
        profiles = (profs ?? []) as ProfileLite[];
      }
      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
      return list.map((b) => ({ ...b, profile: profileMap.get(b.user_id) ?? null }));
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messaging_chat_bindings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Unlinked", description: "Chat binding removed." });
      qc.invalidateQueries({ queryKey: ["messaging_chat_bindings_admin"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LinkIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Linked Chats</CardTitle>
            <CardDescription>
              Guests and staff currently connected via Telegram, WhatsApp, or SMS. Unlink to revoke.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load: {(error as Error).message}</p>
        ) : !data || data.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No linked chats yet. Once a guest sends <code>/link &lt;code&gt;</code> to the bot, they'll appear here.
          </div>
        ) : (
          <div className="divide-y">
            {data.map((row) => {
              const name =
                row.display_name?.trim() ||
                row.profile?.full_name?.trim() ||
                row.profile?.email ||
                "Unknown user";
              const sub = row.profile?.email && row.display_name ? row.profile.email : null;
              return (
                <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{name}</p>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {CHANNEL_LABEL[row.channel] ?? row.channel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {sub ? `${sub} · ` : ""}Linked {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Unlink ${name} from ${CHANNEL_LABEL[row.channel] ?? row.channel}?`)) {
                        unlinkMutation.mutate(row.id);
                      }
                    }}
                    disabled={unlinkMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Unlink
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
