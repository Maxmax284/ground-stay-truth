import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  front_desk_supervisor: "Front Desk Supervisor",
  front_desk: "Front Desk",
  maintenance: "Maintenance",
  viewer: "Viewer",
  guest: "Guest",
};

export default function UserRoleManager() {
  const { roles, addRole, removeRole } = useUserRoles();
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("viewer");

  const handleAdd = () => {
    if (!newUserId.trim()) return;
    addRole.mutate({ user_id: newUserId.trim(), role: newRole }, {
      onSuccess: () => setNewUserId(""),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">User Roles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add role form */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="userId" className="text-xs">User ID</Label>
            <Input
              id="userId"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="Paste user UUID"
              className="font-mono text-xs"
            />
          </div>
          <div className="w-full sm:w-48 space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.app_role.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={addRole.isPending} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Assign
            </Button>
          </div>
        </div>

        {/* Existing roles */}
        {roles.isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !roles.data?.length ? (
          <p className="text-sm text-muted-foreground">No roles assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {roles.data.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-md p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.profile_name || r.profile_email || r.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{r.user_id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{ROLE_LABELS[r.role]}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeRole.mutate(r.id)}
                    disabled={removeRole.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
