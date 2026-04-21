import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Send, Loader2, Users, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Binding {
  id: string;
  user_id: string;
  channel: string;
  chat_id: string;
  display_name: string | null;
  last_seen_at: string;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface RoleRow {
  user_id: string;
  role: string;
}

interface PingResult {
  binding_id: string;
  user_id: string;
  channel: string;
  outcome: "sent" | "failed";
  error?: string;
  sent_at: string;
}

export function MessagingDeliveryDashboard() {
  const { toast } = useToast();
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, PingResult>>({});
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: bs, error: bErr } = await supabase
        .from("messaging_chat_bindings")
        .select("id, user_id, channel, chat_id, display_name, last_seen_at")
        .order("last_seen_at", { ascending: false });
      if (bErr) throw bErr;
      const list = (bs || []) as Binding[];
      setBindings(list);

      const userIds = Array.from(new Set(list.map((b) => b.user_id)));
      if (userIds.length) {
        const [{ data: ps }, { data: rs }] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds),
          supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        ]);
        const profMap: Record<string, ProfileRow> = {};
        (ps || []).forEach((p: any) => { profMap[p.user_id] = p; });
        setProfiles(profMap);
        const rMap: Record<string, string[]> = {};
        (rs || []).forEach((r: RoleRow) => {
          rMap[r.user_id] = [...(rMap[r.user_id] || []), r.role];
        });
        setRoles(rMap);
      }
    } catch (err: any) {
      toast({ title: "Failed to load", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handlePingAll = async () => {
    if (!bindings.length) {
      toast({ title: "No connected accounts", description: "Nothing to ping yet." });
      return;
    }
    setPinging(true);
    setProgress(8);
    setResults({});
    // Smooth fake progress while the function runs (sequential sends server-side)
    const tick = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 10)) : p));
    }, 400);
    try {
      const { data, error } = await supabase.functions.invoke("messaging-ping-all", { body: {} });
      if (error) throw error;
      const map: Record<string, PingResult> = {};
      (data?.results || []).forEach((r: PingResult) => { map[r.binding_id] = r; });
      setResults(map);
      setProgress(100);
      toast({
        title: "Ping complete",
        description: `${data?.sent ?? 0} sent · ${data?.failed ?? 0} failed`,
      });
      await loadAll();
    } catch (err: any) {
      toast({ title: "Ping failed", description: err.message, variant: "destructive" });
    } finally {
      clearInterval(tick);
      setTimeout(() => setProgress(0), 1200);
      setPinging(false);
    }
  };

  const allRoles = useMemo(() => {
    const set = new Set<string>();
    Object.values(roles).flat().forEach((r) => set.add(r));
    return Array.from(set).sort();
  }, [roles]);

  const allChannels = useMemo(() => {
    return Array.from(new Set(bindings.map((b) => b.channel))).sort();
  }, [bindings]);

  const filtered = useMemo(() => {
    return bindings.filter((b) => {
      if (channelFilter !== "all" && b.channel !== channelFilter) return false;
      if (roleFilter !== "all") {
        const userRoles = roles[b.user_id] || [];
        if (!userRoles.includes(roleFilter)) return false;
      }
      return true;
    });
  }, [bindings, roles, roleFilter, channelFilter]);

  const uniqueUsers = new Set(bindings.map((b) => b.user_id)).size;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Connected Accounts & Delivery</CardTitle>
              <CardDescription>
                {loading ? "Loading…" : `${uniqueUsers} user${uniqueUsers === 1 ? "" : "s"} · ${bindings.length} channel link${bindings.length === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
          </div>
          <Button onClick={handlePingAll} disabled={pinging || loading || !bindings.length} size="sm">
            {pinging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Ping All Connected Accounts
          </Button>
        </div>
        {(pinging || progress > 0) && (
          <div className="pt-3">
            <Progress value={progress} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {pinging ? "Sending test messages…" : "Done"}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {allRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {allChannels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
            {loading ? "Loading connected accounts…" : "No connected accounts match these filters."}
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Channel</TableHead>
                  <TableHead className="text-xs">Last Seen</TableHead>
                  <TableHead className="text-xs">Last Ping</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const profile = profiles[b.user_id];
                  const userRoles = roles[b.user_id] || [];
                  const result = results[b.id];
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{profile?.full_name || b.display_name || "—"}</div>
                        <div className="text-muted-foreground text-[11px]">{profile?.email || b.chat_id}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {userRoles.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : userRoles.map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="text-[10px] capitalize">{b.channel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(b.last_seen_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {!result ? (
                          <span className="text-muted-foreground">—</span>
                        ) : result.outcome === "sent" ? (
                          <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
                            <CheckCircle2 className="h-3 w-3" />
                            Sent · {formatDistanceToNow(new Date(result.sent_at), { addSuffix: true })}
                          </Badge>
                        ) : (
                          <div className="space-y-1">
                            <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/30 bg-destructive/5">
                              <XCircle className="h-3 w-3" />
                              Failed
                            </Badge>
                            {result.error && (
                              <div className="text-[10px] text-muted-foreground truncate max-w-[260px]" title={result.error}>
                                {result.error}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
