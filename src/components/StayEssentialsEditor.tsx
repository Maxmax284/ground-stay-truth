import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting, type PolicySetting } from "@/hooks/usePolicySettings";
import {
  Save, Wifi, Shield, Phone, ScrollText, Eye, EyeOff, Plus, X, Check,
} from "lucide-react";

const PRESET_RULES = [
  "No smoking indoors",
  "Quiet hours 10 PM – 7 AM",
  "No outside guests after 10 PM",
  "Keep common areas clean",
  "No shoes inside the rooms",
  "Lock doors when leaving",
  "Report damages immediately",
  "No pets allowed",
  "Dispose of trash in designated bins",
  "Respect other guests' privacy",
  "No cooking in rooms",
  "Use gym equipment at your own risk",
];

function parseRules(value: unknown): string[] {
  if (!value) return [];
  const str = String(value);
  // Try JSON array first
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  // Fall back to newline/bullet-separated
  return str
    .split(/[\n•\r]+/)
    .map((s) => s.replace(/^[-–—*]\s*/, "").trim())
    .filter(Boolean);
}

function serializeRules(rules: string[]): string {
  return JSON.stringify(rules);
}

export function StayEssentialsEditor() {
  const { data: settings } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();

  const [showPassword, setShowPassword] = useState(false);
  const [customRule, setCustomRule] = useState("");

  // Local edit state per field
  const [edits, setEdits] = useState<Record<string, string>>({});

  const byKey = useMemo(() => {
    const map: Record<string, PolicySetting> = {};
    settings?.forEach((s) => { map[s.key] = s; });
    return map;
  }, [settings]);

  const getVal = (key: string) => String(byKey[key]?.value ?? "");
  const getSetting = (key: string) => byKey[key];

  const currentRules = useMemo(
    () => parseRules(byKey["house_rules_summary"]?.value),
    [byKey]
  );

  // ── Save helpers ──
  const saveField = async (key: string) => {
    const s = getSetting(key);
    if (!s) return;
    const raw = edits[key];
    if (raw === undefined) return;
    let parsed: any = raw;
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== "") parsed = num;
    try {
      await updateSetting.mutateAsync({ id: s.id, value: parsed });
      toast({ title: "Saved", description: `${key.replace(/_/g, " ")} updated.` });
      setEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const saveRules = async (rules: string[]) => {
    const s = getSetting("house_rules_summary");
    if (!s) return;
    try {
      await updateSetting.mutateAsync({ id: s.id, value: serializeRules(rules) });
      toast({ title: "House rules updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const addRule = (rule: string) => {
    const trimmed = rule.trim();
    if (!trimmed || currentRules.includes(trimmed)) return;
    saveRules([...currentRules, trimmed]);
  };

  const removeRule = (rule: string) => {
    saveRules(currentRules.filter((r) => r !== rule));
  };

  const editableValue = (key: string) => edits[key] ?? getVal(key);
  const isDirty = (key: string) => edits[key] !== undefined;

  const unusedPresets = PRESET_RULES.filter((r) => !currentRules.includes(r));

  return (
    <div className="space-y-5">
      {/* ── WiFi Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Wifi className="h-4 w-4" />
            </div>
            WiFi Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Network name */}
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                Network Name
              </Label>
              <div className="flex gap-2">
                <Input
                  value={editableValue("wifi_network_name")}
                  onChange={(e) => setEdits((p) => ({ ...p, wifi_network_name: e.target.value }))}
                  placeholder="e.g. GroundCamp-5G"
                  className="h-9"
                />
                {isDirty("wifi_network_name") && (
                  <Button size="sm" onClick={() => saveField("wifi_network_name")} disabled={updateSetting.isPending} className="h-9 gap-1">
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                )}
              </div>
            </div>
            {/* Password */}
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                Password
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={editableValue("wifi_password")}
                    onChange={(e) => setEdits((p) => ({ ...p, wifi_password: e.target.value }))}
                    placeholder="••••••••"
                    className="h-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {isDirty("wifi_password") && (
                  <Button size="sm" onClick={() => saveField("wifi_password")} disabled={updateSetting.isPending} className="h-9 gap-1">
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Shown to guests in their portal during confirmed & checked-in stays.
          </p>
        </CardContent>
      </Card>

      {/* ── Emergency Contact Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-destructive/10 text-destructive">
              <Phone className="h-4 w-4" />
            </div>
            Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Contact Name</Label>
              <div className="flex gap-2">
                <Input
                  value={editableValue("emergency_contact_name")}
                  onChange={(e) => setEdits((p) => ({ ...p, emergency_contact_name: e.target.value }))}
                  placeholder="e.g. Front Desk Manager"
                  className="h-9"
                />
                {isDirty("emergency_contact_name") && (
                  <Button size="sm" onClick={() => saveField("emergency_contact_name")} disabled={updateSetting.isPending} className="h-9 gap-1">
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  value={editableValue("emergency_contact_phone")}
                  onChange={(e) => setEdits((p) => ({ ...p, emergency_contact_phone: e.target.value }))}
                  placeholder="e.g. +66 81 234 5678"
                  className="h-9"
                />
                {isDirty("emergency_contact_phone") && (
                  <Button size="sm" onClick={() => saveField("emergency_contact_phone")} disabled={updateSetting.isPending} className="h-9 gap-1">
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Displayed to guests for emergencies. Unit-specific contacts override this global default.
          </p>
        </CardContent>
      </Card>

      {/* ── House Rules Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-accent text-accent-foreground">
              <ScrollText className="h-4 w-4" />
            </div>
            House Rules (Global Default)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active rules */}
          {currentRules.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {currentRules.map((rule) => (
                <Badge
                  key={rule}
                  variant="secondary"
                  className="gap-1.5 py-1.5 px-3 text-xs font-normal"
                >
                  <Check className="h-3 w-3 text-primary shrink-0" />
                  {rule}
                  <button
                    onClick={() => removeRule(rule)}
                    className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No house rules configured yet.</p>
          )}

          {/* Add custom rule */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Add custom rule</Label>
            <div className="flex gap-2">
              <Input
                value={customRule}
                onChange={(e) => setCustomRule(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customRule.trim()) {
                    addRule(customRule);
                    setCustomRule("");
                  }
                }}
                placeholder="Type a custom rule and press Enter"
                className="h-9"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (customRule.trim()) {
                    addRule(customRule);
                    setCustomRule("");
                  }
                }}
                disabled={!customRule.trim() || updateSetting.isPending}
                className="h-9 gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          {/* Preset suggestions */}
          {unusedPresets.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Quick add from presets</Label>
              <div className="flex flex-wrap gap-1.5">
                {unusedPresets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => addRule(preset)}
                    disabled={updateSetting.isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Individual units can override these with unit-specific rules in the Units editor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
