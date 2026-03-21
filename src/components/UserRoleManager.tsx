import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Plus, Search, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useUserRoles, type UserRoleRow } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";
import CreateStaffAccountForm from "@/components/CreateStaffAccountForm";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProfileResult { user_id: string; full_name: string | null; email: string | null; }

export default function UserRoleManager() {
  const { t } = useTranslation();
  const { roles, addRole, removeRole, createStaffAccount } = useUserRoles();
  const [newRole, setNewRole] = useState<AppRole>("viewer");

  const adminCount = useMemo(() => (roles.data ?? []).filter((r) => r.role === "admin").length, [roles.data]);
  const supervisorCount = useMemo(() => (roles.data ?? []).filter((r) => r.role === "front_desk_supervisor").length, [roles.data]);
  const supervisorCapReached = newRole === "front_desk_supervisor" && supervisorCount >= 2;

  const isLastAdmin = (role: UserRoleRow) => role.role === "admin" && adminCount <= 1;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ProfileResult | null>(null);
  const [useUuid, setUseUuid] = useState(false);
  const [manualUuid, setManualUuid] = useState("");

  const handleSearch = async (query: string) => {
    setSearchQuery(query); setSelectedUser(null);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase.from("profiles").select("user_id, full_name, email").or(`full_name.ilike.%${query}%,email.ilike.%${query}%`).limit(10);
    setSearchResults(data ?? []); setSearching(false);
  };

  const handleSelectUser = (profile: ProfileResult) => { setSelectedUser(profile); setSearchQuery(profile.full_name || profile.email || profile.user_id); setSearchResults([]); };

  const handleAdd = () => {
    const userId = useUuid ? manualUuid.trim() : selectedUser?.user_id; if (!userId) return;
    addRole.mutate({ user_id: userId, role: newRole }, { onSuccess: () => { setSelectedUser(null); setSearchQuery(""); setManualUuid(""); } });
  };

  return (
    <div className="space-y-4">
      <CreateStaffAccountForm createStaffAccount={createStaffAccount} existingRoles={roles.data} />
      <Card>
        <CardHeader><CardTitle className="text-lg">{t("userRoles.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{useUuid ? t("userRoles.userId") : t("userRoles.searchUser")}</Label>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setUseUuid(!useUuid); setSelectedUser(null); setSearchQuery(""); setManualUuid(""); }}>
                {useUuid ? t("userRoles.searchByName") : t("userRoles.enterUuid")}
              </button>
            </div>
            {useUuid ? <Input value={manualUuid} onChange={(e) => setManualUuid(e.target.value)} placeholder={t("userRoles.pasteUuid")} className="font-mono text-xs" /> : (
              <div className="relative">
                <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder={t("userRoles.searchPlaceholder")} className="pl-8 text-sm" /></div>
                {searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
                    {searchResults.map((p) => <button key={p.user_id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors" onClick={() => handleSelectUser(p)}><span className="font-medium">{p.full_name || t("common.noName")}</span>{p.email && <span className="text-muted-foreground ml-2 text-xs">{p.email}</span>}</button>)}
                  </div>
                )}
                {searching && <p className="text-xs text-muted-foreground mt-1">{t("userRoles.searching")}</p>}
                {selectedUser && <p className="text-xs text-muted-foreground mt-1">{t("userRoles.selected")}: <span className="font-mono">{selectedUser.user_id.slice(0, 8)}…</span></p>}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t("userRoles.role")}</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Constants.public.Enums.app_role.map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAdd} disabled={addRole.isPending || (useUuid ? !manualUuid.trim() : !selectedUser) || supervisorCapReached} size="sm"><Plus className="h-4 w-4 mr-1" /> {t("userRoles.assign")}</Button>
              </div>
            </div>
            {supervisorCapReached && <div className="flex items-center gap-2 text-sm text-warning-foreground bg-warning/10 rounded-md p-2"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{t("userRoles.supervisorCap")}</span></div>}
          </div>
          {roles.isLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : !roles.data?.length ? <p className="text-sm text-muted-foreground">{t("userRoles.noRoles")}</p> : (
            <div className="space-y-2">
              {roles.data.map((r) => (
                <div key={r.id} className="flex items-center justify-between border rounded-md p-3">
                  <div className="min-w-0"><p className="text-sm font-medium truncate">{r.profile_name || r.profile_email || r.user_id}</p><p className="text-xs text-muted-foreground font-mono truncate">{r.user_id}</p></div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{t(`roles.${r.role}`)}</Badge>
                    {isLastAdmin(r) ? (
                      <span className="text-xs text-muted-foreground italic">{t("userRoles.lastAdmin", "Last admin")}</span>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRole.mutate(r.id)} disabled={removeRole.isPending}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
