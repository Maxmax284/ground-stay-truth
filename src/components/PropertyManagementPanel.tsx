import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, Trash2, Shield, Users, Car, Settings2,
  Globe, Clock, Zap, Moon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ── Types ───────────────────────────────────────────── */

interface Property {
  id: string;
  slug: string;
  name: string;
  operational_mode: string;
  timezone: string;
  is_active: boolean;
  settings: Record<string, unknown>;
}

type PropertyUpdate = {
  id: string;
  operational_mode?: string;
  timezone?: string;
  is_active?: boolean;
};

interface UserAssignment {
  id: string;
  user_id: string;
  property_id: string;
  is_default: boolean;
  profile_name: string | null;
  profile_email: string | null;
  property_name: string;
  property_slug: string;
}

interface DriverAssignment {
  id: string;
  driver_id: string;
  property_id: string;
  driver_name: string;
  property_name: string;
  property_slug: string;
}

interface StaffUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

interface DriverOption {
  id: string;
  name: string;
  is_active: boolean;
}

const SLUG_COLORS: Record<string, string> = {
  lamai: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "koh-shanti": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
};

const MODE_CONFIG: Record<string, { icon: typeof Zap; label: string; description: string }> = {
  high_turnover: { icon: Zap, label: "High Turnover", description: "Daily arrivals/departures, event-based housekeeping" },
  long_stay: { icon: Moon, label: "Long Stay", description: "Weekly rhythms, scheduled housekeeping" },
};

/* ── Shared Queries ──────────────────────────────────── */

function useProperties() {
  return useQuery({
    queryKey: ["admin-properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").order("name");
      if (error) throw error;
      return data as Property[];
    },
  });
}

function useStaffUsers() {
  return useQuery({
    queryKey: ["staff-users-for-assignment"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles").select("user_id, role").neq("role", "guest");
      if (error) throw error;
      const userIds = [...new Set(roles.map((r) => r.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));
      return userIds.map((uid): StaffUser => ({
        user_id: uid,
        full_name: profileMap.get(uid)?.full_name ?? null,
        email: profileMap.get(uid)?.email ?? null,
        role: roleMap.get(uid) ?? "unknown",
      }));
    },
  });
}

function useDriverOptions() {
  return useQuery({
    queryKey: ["driver-options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("id, name, is_active").order("name");
      if (error) throw error;
      return data as DriverOption[];
    },
  });
}

/* ── Property Details Section ────────────────────────── */

function PropertyDetailsSection() {
  const { data: properties, isLoading } = useProperties();
  const qc = useQueryClient();

  const updateProperty = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Property> & { id: string }) => {
      const { error } = await supabase.from("properties").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      qc.invalidateQueries({ queryKey: ["user-properties"] });
      toast.success("Property updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {(properties ?? []).map((p) => {
        const modeConf = MODE_CONFIG[p.operational_mode] ?? MODE_CONFIG.high_turnover;
        const ModeIcon = modeConf.icon;
        return (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">{p.name}</h3>
                    <Badge className={SLUG_COLORS[p.slug] ?? "bg-muted text-muted-foreground"} variant="secondary">
                      {p.slug}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.timezone}</span>
                    <span className="flex items-center gap-1"><ModeIcon className="h-3 w-3" />{modeConf.label}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Active</Label>
                  <Switch
                    checked={p.is_active}
                    onCheckedChange={(v) => updateProperty.mutate({ id: p.id, is_active: v })}
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Operational Mode</Label>
                  <Select
                    value={p.operational_mode}
                    onValueChange={(v) => updateProperty.mutate({ id: p.id, operational_mode: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high_turnover">
                        <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> High Turnover</span>
                      </SelectItem>
                      <SelectItem value="long_stay">
                        <span className="flex items-center gap-1.5"><Moon className="h-3 w-3" /> Long Stay</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">{modeConf.description}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Timezone</Label>
                  <Select
                    value={p.timezone}
                    onValueChange={(v) => updateProperty.mutate({ id: p.id, timezone: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Bangkok">Asia/Bangkok (ICT)</SelectItem>
                      <SelectItem value="Asia/Ho_Chi_Minh">Asia/Ho Chi Minh (ICT)</SelectItem>
                      <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                      <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                      <SelectItem value="Pacific/Auckland">Pacific/Auckland (NZST)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ── User Assignments Section ────────────────────────── */

function UserAssignmentsSection() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const { data: properties } = useProperties();
  const { data: staffUsers } = useStaffUsers();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["property-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_property_assignments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const userIds = [...new Set(data.map((a) => a.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };
      const { data: props } = await supabase.from("properties").select("id, name, slug");
      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const propMap = new Map((props ?? []).map((p) => [p.id, p]));
      return data.map((a): UserAssignment => ({
        ...a,
        profile_name: profileMap.get(a.user_id)?.full_name ?? null,
        profile_email: profileMap.get(a.user_id)?.email ?? null,
        property_name: propMap.get(a.property_id)?.name ?? "Unknown",
        property_slug: propMap.get(a.property_id)?.slug ?? "",
      }));
    },
  });

  const addAssignment = useMutation({
    mutationFn: async ({ user_id, property_id }: { user_id: string; property_id: string }) => {
      const { error } = await supabase
        .from("user_property_assignments").insert({ user_id, property_id, is_default: false });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-assignments"] });
      toast.success("User assigned to property");
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
      toast.success("Assignment removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    if (!assignments) return new Map<string, UserAssignment[]>();
    const map = new Map<string, UserAssignment[]>();
    for (const a of assignments) {
      if (!map.has(a.user_id)) map.set(a.user_id, []);
      map.get(a.user_id)!.push(a);
    }
    return map;
  }, [assignments]);

  const umbrellaCount = useMemo(
    () => [...grouped.values()].filter((items) => items.length > 1).length,
    [grouped]
  );

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="flex-1 text-xs">
              <SelectValue placeholder="Select staff user..." />
            </SelectTrigger>
            <SelectContent>
              {(staffUsers ?? []).map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  <span>{u.full_name || u.email || u.user_id.slice(0, 8)}</span>
                  <span className="text-muted-foreground ml-1">({u.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="sm:w-[180px] text-xs">
              <SelectValue placeholder="Property..." />
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
      </div>

      {/* Umbrella summary */}
      {umbrellaCount > 0 && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs">
            <span className="font-medium">{umbrellaCount} umbrella operator{umbrellaCount > 1 ? "s" : ""}</span>
            <span className="text-muted-foreground"> — can switch between multiple properties</span>
          </p>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !assignments?.length ? (
        <p className="text-sm text-muted-foreground">No property assignments yet.</p>
      ) : (
        <div className="space-y-2">
          {[...grouped.entries()].map(([userId, items]) => (
            <div key={userId} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{items[0].profile_name || items[0].profile_email || userId.slice(0, 8)}</p>
                  {items[0].profile_email && <p className="text-xs text-muted-foreground truncate">{items[0].profile_email}</p>}
                </div>
                {items.length > 1 && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    <Shield className="h-3 w-3 mr-0.5" /> Umbrella
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center gap-1">
                    <Badge variant="secondary" className={`text-[10px] ${SLUG_COLORS[a.property_slug] ?? ""}`}>
                      {a.property_name}
                    </Badge>
                    {a.is_default && <span className="text-[9px] text-muted-foreground">default</span>}
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5 text-destructive"
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
    </div>
  );
}

/* ── Driver Assignments Section ──────────────────────── */

function DriverAssignmentsSection() {
  const qc = useQueryClient();
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const { data: properties } = useProperties();
  const { data: drivers } = useDriverOptions();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["driver-property-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_property_assignments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const driverIds = [...new Set(data.map((a) => a.driver_id))];
      const { data: driverList } = driverIds.length
        ? await supabase.from("drivers").select("id, name").in("id", driverIds)
        : { data: [] };
      const { data: props } = await supabase.from("properties").select("id, name, slug");
      const driverMap = new Map((driverList ?? []).map((d) => [d.id, d]));
      const propMap = new Map((props ?? []).map((p) => [p.id, p]));
      return data.map((a): DriverAssignment => ({
        ...a,
        driver_name: driverMap.get(a.driver_id)?.name ?? "Unknown",
        property_name: propMap.get(a.property_id)?.name ?? "Unknown",
        property_slug: propMap.get(a.property_id)?.slug ?? "",
      }));
    },
  });

  const addAssignment = useMutation({
    mutationFn: async ({ driver_id, property_id }: { driver_id: string; property_id: string }) => {
      const { error } = await supabase
        .from("driver_property_assignments").insert({ driver_id, property_id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-property-assignments"] });
      toast.success("Driver assigned to property");
      setSelectedDriverId("");
      setSelectedPropertyId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("driver_property_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-property-assignments"] });
      toast.success("Driver assignment removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    if (!assignments) return new Map<string, DriverAssignment[]>();
    const map = new Map<string, DriverAssignment[]>();
    for (const a of assignments) {
      if (!map.has(a.driver_id)) map.set(a.driver_id, []);
      map.get(a.driver_id)!.push(a);
    }
    return map;
  }, [assignments]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
          <SelectTrigger className="flex-1 text-xs">
            <SelectValue placeholder="Select driver..." />
          </SelectTrigger>
          <SelectContent>
            {(drivers ?? []).filter((d) => d.is_active).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                <span className="flex items-center gap-1.5"><Car className="h-3 w-3" />{d.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger className="sm:w-[180px] text-xs">
            <SelectValue placeholder="Property..." />
          </SelectTrigger>
          <SelectContent>
            {(properties ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => addAssignment.mutate({ driver_id: selectedDriverId, property_id: selectedPropertyId })}
          disabled={!selectedDriverId || !selectedPropertyId || addAssignment.isPending}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" /> Assign
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !assignments?.length ? (
        <p className="text-sm text-muted-foreground">No driver assignments yet. Assign drivers to properties so they appear in the correct pickup queues.</p>
      ) : (
        <div className="space-y-2">
          {[...grouped.entries()].map(([driverId, items]) => (
            <div key={driverId} className="border rounded-md p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{items[0].driver_name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center gap-1">
                    <Badge variant="secondary" className={`text-[10px] ${SLUG_COLORS[a.property_slug] ?? ""}`}>
                      {a.property_name}
                    </Badge>
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5 text-destructive"
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
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */

export default function PropertyManagementPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Property Management
          </CardTitle>
          <CardDescription>
            Manage properties, assign staff and drivers, and configure operational settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="properties" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="properties" className="text-xs gap-1">
                <Settings2 className="h-3 w-3" /> Properties
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs gap-1">
                <Users className="h-3 w-3" /> Staff Access
              </TabsTrigger>
              <TabsTrigger value="drivers" className="text-xs gap-1">
                <Car className="h-3 w-3" /> Drivers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="properties">
              <PropertyDetailsSection />
            </TabsContent>

            <TabsContent value="users">
              <UserAssignmentsSection />
            </TabsContent>

            <TabsContent value="drivers">
              <DriverAssignmentsSection />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
