import { useEffect, useMemo, useState } from "react";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { parseWelcomeSheet, type WelcomeSheet } from "@/lib/welcomeSheet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Save, X, BookOpen } from "lucide-react";
import { toast } from "sonner";

const FIELDS: { key: keyof Omit<WelcomeSheet, "emergency">; label: string; hint: string }[] = [
  { key: "welcome", label: "Welcome message", hint: "The greeting at the top of the sheet." },
  { key: "reception", label: "Reception & office", hint: "Where the office is and opening hours. Check-in/out times come from Policies." },
  { key: "services", label: "What the camp can do for you", hint: "Private lessons, scooter hire, visas, shop, transfers…" },
  { key: "housekeeping", label: "Housekeeping & laundry", hint: "Cleaning days, towel swaps, laundry drop-off and prices." },
  { key: "general", label: "General information", hint: "Anything else from the paper binder." },
];

/** One place to edit the guest welcome sheet. Wi-Fi and house rules stay in Policies → Stay essentials. */
export function WelcomeSheetEditor() {
  const { data: settings } = usePolicySettings();
  const update = useUpdatePolicySetting();
  const row = useMemo(() => settings?.find((s) => s.key === "welcome_sheet" && !s.property_id), [settings]);
  const [sheet, setSheet] = useState<WelcomeSheet>(parseWelcomeSheet(null));

  useEffect(() => { if (row) setSheet(parseWelcomeSheet(row.value)); }, [row]);

  const save = async () => {
    if (!row) return;
    try {
      const clean = { ...sheet, emergency: sheet.emergency.filter((e) => e.label.trim() || e.phone.trim()) };
      await update.mutateAsync({ id: row.id, value: clean as any });
      toast.success("Welcome sheet saved — guests see it now");
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    }
  };

  const setEm = (i: number, k: "label" | "phone", v: string) =>
    setSheet((s) => ({ ...s, emergency: s.emergency.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Guest welcome sheet</CardTitle>
        <CardDescription>
          The paper binder, in the guest portal. Leave a box empty and that section is hidden.
          Wi-Fi, house rules and the main front-desk number are edited in Policies → Stay essentials and show here automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!row && <p className="text-sm text-destructive">Welcome sheet setting is missing — contact an admin.</p>}
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`ws-${f.key}`}>{f.label}</Label>
            <p className="text-xs text-muted-foreground">{f.hint}</p>
            <Textarea id={`ws-${f.key}`} rows={3} value={sheet[f.key]} onChange={(e) => setSheet((s) => ({ ...s, [f.key]: e.target.value }))} />
          </div>
        ))}
        <div className="space-y-2">
          <Label>Emergency numbers</Label>
          <p className="text-xs text-muted-foreground">Hospital, police, tourist police, ambulance… Guests can tap to call.</p>
          {sheet.emergency.map((e, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Name (e.g. Bangkok Hospital Samui)" value={e.label} onChange={(ev) => setEm(i, "label", ev.target.value)} />
              <Input placeholder="Phone" value={e.phone} onChange={(ev) => setEm(i, "phone", ev.target.value)} className="max-w-[180px]" />
              <Button variant="ghost" size="icon" aria-label="Remove number" onClick={() => setSheet((s) => ({ ...s, emergency: s.emergency.filter((_, j) => j !== i) }))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setSheet((s) => ({ ...s, emergency: [...s.emergency, { label: "", phone: "" }] }))}><Plus className="h-4 w-4 mr-1" />Add number</Button>
        </div>
        <Button onClick={save} disabled={!row || update.isPending}><Save className="h-4 w-4 mr-1.5" />Save welcome sheet</Button>
      </CardContent>
    </Card>
  );
}
