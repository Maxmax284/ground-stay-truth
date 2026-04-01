import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Assignment {
  id: string;
  user_id: string;
  property_id: string;
  is_default: boolean;
  profile_name: string | null;
  profile_email: string | null;
  property_name: string;
  property_slug: string;
}

export default function PropertyAssignmentManager() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");

  // Fetch all assignments with joined data
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["property-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_property_assignments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set(data.map((a) => a.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };

      const { data: properties } = await supabase.from("properties").select("id, name, slug");

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const propMap = new Map((properties ?? []).map((p) => [p.id, p]));

      return data.map((a): Assignment => ({
        ...a,
        profile_name: profileMap.get(a.user_id)?.full_name ?? null,
        profile_email: profileMap.get(a.user_id)?.email ?? null,
        property_name: propMap.get(a.property_id)?.name ?? "Unknown",
        property_slug: propMap.get(a.property_id)?.slug ?? "",
      }));
    },
  });

  // Fetch properties for the dropdown
  const { data: properties } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name, slug").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch staff users (non-guest roles) for the dropdown
  const { data: staffUsers } = useQuery({
    queryKey: ["staff-users-for-assignment"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .neq("role", "guest");
      if (error) throw error;

      const userIds = [...new Set(roles.map((r) => r.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));

      return userIds.map((uid) => ({
        user_id: uid,
        full_name: profileMap.get(uid)?.full_name ?? null,
        email: profileMap.get(uid)?.email ?? null,
        role: roleMap.get(uid) ?? "unknown",
      }));
    },
  });

  const addAssignment = useMutation({
    mutationFn: async ({ user_id, property_id }: { user_id: string; property_id: string }) => {
      const { error } = await supabase
        .from("user_property_assignments")
        .insert({ user_id, property_id, is_default: false });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-assignments"] });
      toast.success("Property assignment added");
      setSelectedUserId("");
      setSelectedPropertyId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_property_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-assignments"] });
      toast.success("Property assignment removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group assignments by user
  const grouped = useMemo(() => {
    if (!assignments) return new Map<string, Assignment[]>();
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const key = a.user_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [assignments]);

  const umbrellaUsers = useMemo(
    () => [...grouped.entries()].filter(([, items]) => items.length > 1),
    [grouped]
  );

  const SLUG_COLORS: Record<string, string> = {
    lamai: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    "koh-shanti": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Property Assignments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add assignment form */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select user..." />
            </SelectTrigger>
            <SelectContent>
              {(staffUsers ?? []).map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.full_name || u.email || u.user_id.slice(0, 8)}
                  <span className="text-muted-foreground ml-1 text-xs">({u.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select property..." />
            </SelectTrigger>
            <SelectContent>
              {(properties ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => addAssignment.mutate({ user_id: selectedUserId, property_id: selectedPropertyId })}
            disabled={!selectedUserId || !selectedPropertyId || addAssignment.isPending}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" /> Assign
          </Button>
        </div>

        {/* Umbrella users highlight */}
        {umbrellaUsers.length > 0 && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-1">
              <Shield className="h-4 w-4 text-primary" />
              Umbrella Operators ({umbrellaUsers.length})
            </p>
            <p className="text-xs text-muted-foreground">
              These users can switch between multiple properties.
            </p>
          </div>
        )}

        {/* Assignment list grouped by user */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !assignments?.length ? (
          <p className="text-sm text-muted-foreground">No property assignments yet.</p>
        ) : (
          <div className="space-y-3">
            {[...grouped.entries()].map(([userId, items]) => (
              <div key={userId} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{items[0].profile_name || items[0].profile_email || userId.slice(0, 8)}</p>
                    {items[0].profile_email && (
                      <p className="text-xs text-muted-foreground">{items[0].profile_email}</p>
                    )}
                  </div>
                  {items.length > 1 && (
                    <Badge variant="outline" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" /> Umbrella
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5">
                      <Badge className={SLUG_COLORS[a.property_slug] ?? "bg-muted text-muted-foreground"}>
                        {a.property_name}
                      </Badge>
                      {a.is_default && <span className="text-[10px] text-muted-foreground">default</span>}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeAssignment.mutate(a.id)}
                        disabled={removeAssignment.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
