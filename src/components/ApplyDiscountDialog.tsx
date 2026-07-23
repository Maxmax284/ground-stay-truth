/**
 * Admin/manager discretionary discount (or surcharge) applied to a booking
 * BEFORE any payment is recorded. Recomputes total + pending deposit and
 * revokes any unpaid payment links via the apply-booking-adjustment edge fn.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Percent, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  currentTotal: number;
  originalTotal?: number | null;
  hasUnpaidLink?: boolean;
  policies?: any[];
}

export function ApplyDiscountDialog({ open, onOpenChange, bookingId, currentTotal, originalTotal, hasUnpaidLink, policies }: Props) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [valueType, setValueType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState<string>("10");
  const [label, setLabel] = useState("Returning customer discount");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const baseline = Number(originalTotal ?? currentTotal ?? 0);
  const numeric = Number(value);
  const preview = useMemo(() => {
    if (!isFinite(numeric) || numeric <= 0) return null;
    const discountAmt = valueType === "percent"
      ? Math.round(baseline * (numeric / 100) * 100) / 100
      : Math.round(numeric * 100) / 100;
    const newTotal = Math.round((baseline - discountAmt) * 100) / 100;
    const depositPct = Number(policies?.find((p: any) => p.key === "deposit_percentage")?.value ?? 20);
    const newDeposit = Math.round(newTotal * depositPct / 100 * 100) / 100;
    return { discountAmt, newTotal, newDeposit, depositPct, invalid: newTotal <= 0 || (valueType === "percent" && numeric > 100) };
  }, [numeric, valueType, baseline, policies]);

  const canSubmit = !saving && label.trim().length > 0 && note.trim().length > 0 && preview && !preview.invalid;

  const handleApply = async () => {
    if (!session || !preview) return;
    setSaving(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apply-booking-adjustment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "apply",
          bookingId,
          valueType,
          value: numeric,
          label: label.trim(),
          internalNote: note.trim(),
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error(json?.error || "Failed to apply discount");
        return;
      }
      toast.success(
        json.revokedLinks > 0
          ? `Discount applied. ${json.revokedLinks} unpaid link revoked — send a fresh one.`
          : "Discount applied."
      );
      qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-payments", bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-financials-payments", bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-adjustments", bookingId] });
      qc.invalidateQueries({ queryKey: ["payment-links", bookingId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply discount</DialogTitle>
          <DialogDescription>
            Discretionary discount applied before payment. Recomputes total, deposit, and revokes any unpaid link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Type</Label>
            <RadioGroup value={valueType} onValueChange={(v) => setValueType(v as any)} className="grid grid-cols-2 gap-2 mt-1">
              <label className={`flex items-center gap-2 border rounded-md p-2 cursor-pointer ${valueType === "percent" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="percent" />
                <Percent className="h-3.5 w-3.5" /> Percentage
              </label>
              <label className={`flex items-center gap-2 border rounded-md p-2 cursor-pointer ${valueType === "fixed" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="fixed" />
                <Coins className="h-3.5 w-3.5" /> Fixed THB
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label>Value {valueType === "percent" ? "(%)" : "(THB)"}</Label>
            <Input type="number" min="0" step={valueType === "percent" ? "0.5" : "50"} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>

          <div>
            <Label>Guest-facing label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Returning customer discount" />
          </div>

          <div>
            <Label>Internal note <span className="text-destructive">*</span></Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approved by Nikki — returning guest, 3rd stay." rows={2} />
          </div>

          {preview && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Baseline total</span><span className="tabular-nums">{formatPrice(baseline, policies)}</span></div>
              <div className="flex justify-between text-[hsl(var(--success))]"><span>Discount</span><span className="tabular-nums">−{formatPrice(preview.discountAmt, policies)}</span></div>
              <div className="flex justify-between font-medium border-t pt-1 mt-1"><span>New total</span><span className="tabular-nums">{formatPrice(preview.newTotal, policies)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>New deposit ({preview.depositPct}%)</span><span className="tabular-nums">{formatPrice(preview.newDeposit, policies)}</span></div>
              {preview.invalid && (
                <p className="text-xs text-destructive pt-1">Invalid: value zeros out or exceeds the booking total.</p>
              )}
            </div>
          )}

          {hasUnpaidLink && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                An unpaid payment link exists. It will be revoked — send a fresh one after applying.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleApply} disabled={!canSubmit}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
