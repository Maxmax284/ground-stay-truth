import { useState, useMemo } from "react";
import { UserPlus, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Database } from "@/integrations/supabase/types";
import type { UserRoleRow } from "@/hooks/useUserRoles";
import type { UseMutationResult } from "@tanstack/react-query";

type AppRole = Database["public"]["Enums"]["app_role"];

const STAFF_ROLES: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "front_desk_supervisor", label: "Front Desk Supervisor" },
  { value: "front_desk", label: "Front Desk" },
  { value: "maintenance", label: "Maintenance" },
  { value: "viewer", label: "Viewer" },
];

interface Props {
  createStaffAccount: UseMutationResult<
    unknown,
    Error,
    { email: string; password: string; full_name: string; role: AppRole }
  >;
  existingRoles: UserRoleRow[] | undefined;
}

export default function CreateStaffAccountForm({ createStaffAccount, existingRoles }: Props) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AppRole>("front_desk");

  const supervisorCount = useMemo(
    () => (existingRoles ?? []).filter((r) => r.role === "front_desk_supervisor").length,
    [existingRoles]
  );
  const supervisorCapReached = role === "front_desk_supervisor" && supervisorCount >= 2;

  const canSubmit =
    fullName.trim().length > 0 &&
    email.includes("@") &&
    password.length >= 6 &&
    !supervisorCapReached &&
    !createStaffAccount.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createStaffAccount.mutate(
      { email: email.trim(), password, full_name: fullName.trim(), role },
      {
        onSuccess: () => {
          setFullName("");
          setEmail("");
          setPassword("");
          setRole("front_desk");
        },
      }
    );
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="cursor-pointer">
          <CollapsibleTrigger asChild>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create Staff Account
            </CardTitle>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-1">
              <Label className="text-xs">Full Name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Smith"
                maxLength={100}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                maxLength={255}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  maxLength={128}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-2.5 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && password.length < 6 && (
                <p className="text-xs text-destructive">Must be at least 6 characters</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {supervisorCapReached && (
              <div className="flex items-center gap-2 text-sm text-warning-foreground bg-warning/10 rounded-md p-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Maximum of 2 supervisors allowed.</span>
              </div>
            )}

            <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
              <UserPlus className="h-4 w-4 mr-1" />
              {createStaffAccount.isPending ? "Creating…" : "Create Account"}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
