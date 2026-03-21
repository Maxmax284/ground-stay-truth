import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Sparkles, CheckCircle2, AlertTriangle, XCircle, Clock, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const CANCELLATION_KEYS = [
  "free_cancellation_days",
  "partial_refund_days",
  "partial_refund_percentage",
  "no_refund_hours",
  "earliest_checkin_time",
  "checkout_time",
];

interface TierConfig {
  freeDays: string;
  partialDays: string;
  partialPct: string;
  noRefundHours: string;
  checkinTime: string;
  checkoutTime: string;
}

export function CancellationPolicyEditor() {
  const { data: settings, isLoading } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const { session } = useAuth();

  const [draftText, setDraftText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const cancellationSettings = useMemo(() => {
    if (!settings) return null;
    return settings.filter((s) => CANCELLATION_KEYS.includes(s.key));
  }, [settings]);

  const [localValues, setLocalValues] = useState<TierConfig | null>(null);

  const currentValues: TierConfig = useMemo(() => {
    if (!cancellationSettings) return { freeDays: "7", partialDays: "3", partialPct: "50", noRefundHours: "72", checkinTime: "16:00", checkoutTime: "11:00" };
    const get = (key: string, fallback: string) => String(cancellationSettings.find((s) => s.key === key)?.value ?? fallback);
    return {
      freeDays: get("free_cancellation_days", "7"),
      partialDays: get("partial_refund_days", "3"),
      partialPct: get("partial_refund_percentage", "50"),
      noRefundHours: get("no_refund_hours", "72"),
      checkinTime: get("earliest_checkin_time", "16:00"),
      checkoutTime: get("checkout_time", "11:00"),
    };
  }, [cancellationSettings]);

  const values = localValues ?? currentValues;
  const isDirty = localValues !== null;

  const update = (field: keyof TierConfig, val: string) => {
    setLocalValues((prev) => ({ ...(prev ?? currentValues), [field]: val }));
  };

  const handleSave = async () => {
    if (!localValues || !cancellationSettings) return;
    const keyMap: Record<keyof TierConfig, string> = {
      freeDays: "free_cancellation_days",
      partialDays: "partial_refund_days",
      partialPct: "partial_refund_percentage",
      noRefundHours: "no_refund_hours",
      checkinTime: "earliest_checkin_time",
      checkoutTime: "checkout_time",
    };
    try {
      for (const [field, policyKey] of Object.entries(keyMap)) {
        const setting = cancellationSettings.find((s) => s.key === policyKey);
        if (!setting) continue;
        const newVal = localValues[field as keyof TierConfig];
        const oldVal = String(setting.value);
        if (newVal !== oldVal) {
          const parsed = isNaN(Number(newVal)) ? newVal : Number(newVal);
          await updateSetting.mutateAsync({ id: setting.id, value: parsed });
        }
      }
      toast({ title: "Cancellation policy updated", description: "All tiers saved successfully." });
      setLocalValues(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleAIDraft = async () => {
    if (!session) return;
    setIsGenerating(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            mode: "policy_draft",
            messages: [
              {
                role: "user",
                content: `Draft a clear, professional cancellation and booking policy for a Muay Thai fight camp accommodation based on these settings:
- Free cancellation: ${values.freeDays} days before check-in (100% refund)
- Partial refund: ${values.partialDays}–${values.freeDays} days before check-in (${values.partialPct}% refund)
- No refund: less than ${values.noRefundHours} hours before check-in
- Check-in time: ${values.checkinTime}
- Check-out time: ${values.checkoutTime}

Write it in plain English, professional but approachable. Include sections for: Cancellation Policy, Check-in/Check-out Times, and any important notes. Keep it concise — max 200 words.`,
              },
            ],
            context: { role: "admin" },
          }),
        }
      );

      if (!resp.ok) throw new Error("Failed to generate policy draft");
      const result = await resp.json();
      setDraftText(result.content || "Unable to generate draft.");
    } catch (err: any) {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  const noRefundDays = Math.round(Number(values.noRefundHours) / 24);

  return (
    <div className="space-y-6">
      {/* Visual Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Cancellation Tiers</CardTitle>
          <CardDescription>Configure when guests can cancel and how much they get back</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timeline visualization */}
          <div className="relative flex items-stretch gap-0 rounded-lg overflow-hidden h-12 text-xs font-medium">
            <div className="flex-1 bg-green-500/15 border border-green-500/30 flex items-center justify-center gap-1.5 text-green-700 dark:text-green-400 min-w-0">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Free ({values.freeDays}+ days)</span>
            </div>
            <div className="flex-1 bg-amber-500/15 border border-amber-500/30 flex items-center justify-center gap-1.5 text-amber-700 dark:text-amber-400 min-w-0">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Partial {values.partialPct}% ({values.partialDays}–{values.freeDays}d)</span>
            </div>
            <div className="flex-1 bg-red-500/15 border border-red-500/30 flex items-center justify-center gap-1.5 text-red-700 dark:text-red-400 min-w-0">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">No refund (&lt;{noRefundDays}d)</span>
            </div>
          </div>

          {/* Tier 1: Free Cancellation */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">Free</Badge>
                Days before check-in
              </Label>
              <Input
                type="number"
                min={1}
                value={values.freeDays}
                onChange={(e) => update("freeDays", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Guest gets 100% refund if cancelled this many days or more before check-in</p>
            </div>

            {/* Tier 2: Partial Refund */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">Partial</Badge>
                Min days & refund %
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  value={values.partialDays}
                  onChange={(e) => update("partialDays", e.target.value)}
                  className="w-20"
                  placeholder="Days"
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={values.partialPct}
                  onChange={(e) => update("partialPct", e.target.value)}
                  className="flex-1"
                  placeholder="% refund"
                />
              </div>
              <p className="text-xs text-muted-foreground">{values.partialPct}% back if {values.partialDays}–{values.freeDays} days before check-in</p>
            </div>

            {/* Tier 3: No Refund */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30">No Refund</Badge>
                Hours cutoff
              </Label>
              <Input
                type="number"
                min={0}
                value={values.noRefundHours}
                onChange={(e) => update("noRefundHours", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">No refund within {values.noRefundHours} hours ({noRefundDays} days) of check-in</p>
            </div>
          </div>

          {/* Check-in / Check-out */}
          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Check-in Time
              </Label>
              <Input
                type="time"
                value={values.checkinTime}
                onChange={(e) => update("checkinTime", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Check-out Time
              </Label>
              <Input
                type="time"
                value={values.checkoutTime}
                onChange={(e) => update("checkoutTime", e.target.value)}
              />
            </div>
          </div>

          {/* Save Button */}
          {isDirty && (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={updateSetting.isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {updateSetting.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Policy Drafter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Policy Drafter
          </CardTitle>
          <CardDescription>Generate professional cancellation policy text based on your current settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleAIDraft}
            disabled={isGenerating}
            variant="outline"
            className="gap-2"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? "Drafting…" : "Generate Policy Text"}
          </Button>

          {draftText && (
            <div className="space-y-3">
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(draftText);
                    toast({ title: "Copied", description: "Policy text copied to clipboard." });
                  }}
                >
                  Copy to Clipboard
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAIDraft}
                  disabled={isGenerating}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}