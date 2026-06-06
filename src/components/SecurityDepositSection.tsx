import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useSecurityDeposit, useCreateSecurityDeposit, useUpdateSecurityDeposit } from "@/hooks/useSecurityDeposit";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { Shield, Check, AlertTriangle, Banknote, CreditCard, HandCoins, ImagePlus, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STATUS_COLORS: Record<string, string> = {
  held: "bg-warning/15 text-warning-foreground",
  inspected: "bg-primary/15 text-primary",
  released: "bg-success/15 text-success",
  deducted: "bg-destructive/15 text-destructive",
};

// Card intentionally excluded — card payments must go through a Stripe link, never recorded manually.
const COLLECTION_METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank_transfer", label: "Bank Transfer", icon: HandCoins },
  { value: "other", label: "Other (offline)", icon: HandCoins },
];

export function SecurityDepositSection({ bookingId, bookingState }: { bookingId: string; bookingState: string }) {
  const { role, user } = useAuth();
  const { data: deposit, isLoading } = useSecurityDeposit(bookingId);
  const { data: policies } = usePolicySettings();
  const createDeposit = useCreateSecurityDeposit();
  const updateDeposit = useUpdateSecurityDeposit();
  const { toast } = useToast();
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionReason, setDeductionReason] = useState("");
  const [collectionMethod, setCollectionMethod] = useState("cash");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const depositSetting = policies?.find((p) => p.key === "security_deposit_amount");
  const depositAmount = Number(depositSetting?.value ?? 0);
  const isRequired = String(policies?.find((p) => p.key === "security_deposit_required")?.value) === "true";

  // Don't show unless security deposits are explicitly enabled in policy settings
  if (!isRequired && !deposit) return null;

  const canManage = permissions.canApproveOverride(role); // Manager+
  const canCollect = permissions.canTransitionState(role); // Front Desk+
  const isCheckout = bookingState === "completed";
  const isActiveStay = bookingState === "checked_in" || bookingState === "confirmed";

  const handleCollect = async () => {
    try {
      await createDeposit.mutateAsync({ booking_id: bookingId, amount_held: depositAmount });
      toast({
        title: "Security deposit collected",
        description: `${formatPrice(depositAmount, policies)} via ${COLLECTION_METHODS.find(m => m.value === collectionMethod)?.label ?? collectionMethod}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleInspect = async () => {
    if (!deposit) return;
    try {
      await updateDeposit.mutateAsync({
        id: deposit.id,
        booking_id: bookingId,
        status: "inspected",
        inspected_by: user?.id,
        notes: inspectionNotes || undefined,
      });
      toast({ title: "Unit inspected", description: "Ready for release or deduction." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRelease = async () => {
    if (!deposit) return;
    try {
      await updateDeposit.mutateAsync({ id: deposit.id, booking_id: bookingId, status: "released", released_by: user?.id });
      toast({ title: "Security deposit released in full" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeduct = async () => {
    if (!deposit || !deductionAmount) return;
    try {
      await updateDeposit.mutateAsync({
        id: deposit.id,
        booking_id: bookingId,
        status: "deducted",
        amount_deducted: parseFloat(deductionAmount),
        deduction_reason: deductionReason || undefined,
        released_by: user?.id,
      });
      toast({ title: "Deduction recorded" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!deposit || !e.target.files?.length) return;
    setUploadingEvidence(true);
    try {
      const file = e.target.files[0];
      const path = `${bookingId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("maintenance-photos").upload(path, file);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("maintenance-photos").getPublicUrl(path);
      const existingUrls = (deposit as any).deduction_evidence_urls ?? [];
      await supabase
        .from("security_deposits")
        .update({ deduction_evidence_urls: [...existingUrls, urlData.publicUrl] } as any)
        .eq("id", deposit.id);
      toast({ title: "Evidence photo uploaded" });
      // Refresh
      await updateDeposit.mutateAsync({ id: deposit.id, booking_id: bookingId });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingEvidence(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <Separator />
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Security Deposit</span>
        {isRequired && !deposit && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
        {deposit && (
          <Badge className={`text-[10px] ${STATUS_COLORS[deposit.status] ?? ""}`}>
            {deposit.status}
          </Badge>
        )}
      </div>

      {!deposit ? (
        /* ── Collection Flow (in-person) ── */
        <div className="space-y-3 border rounded-md p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Collect <span className="font-medium text-foreground">{formatPrice(depositAmount, policies)}</span> from guest in person
          </p>
          <div className="space-y-2">
            <Label className="text-xs">Collection Method</Label>
            <div className="flex gap-1.5">
              {COLLECTION_METHODS.map((method) => {
                const Icon = method.icon;
                const isSelected = collectionMethod === method.value;
                return (
                  <Button
                    key={method.value}
                    type="button"
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    className="h-8 text-xs gap-1.5 flex-1"
                    onClick={() => setCollectionMethod(method.value)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {method.label}
                  </Button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">Card = Stripe link only. No manual card entry.</p>
          </div>
          {canCollect && (
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={handleCollect}
              disabled={createDeposit.isPending}
            >
              <HandCoins className="h-4 w-4" />
              Confirm Deposit Collected ({COLLECTION_METHODS.find(m => m.value === collectionMethod)?.label})
            </Button>
          )}
        </div>
      ) : (
        /* ── Deposit Status & Actions ── */
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">{formatPrice(deposit.amount_held, policies)} held</span>
            {deposit.amount_deducted && deposit.amount_deducted > 0 && (
              <span className="text-xs text-destructive font-medium">
                (-{formatPrice(deposit.amount_deducted, policies)} deducted)
              </span>
            )}
          </div>

          {deposit.notes && (
            <p className="text-xs text-muted-foreground italic">{deposit.notes}</p>
          )}
          {deposit.deduction_reason && (
            <p className="text-xs text-destructive">Reason: {deposit.deduction_reason}</p>
          )}

          {/* Released/deducted final state */}
          {(deposit.status === "released" || deposit.status === "deducted") && (
            <p className="text-xs text-muted-foreground">
              {deposit.status === "released" ? "✓ Full deposit returned to guest" : "Partial deduction applied, remainder returned"}
            </p>
          )}

          {/* ── Inspect step (Manager+ after checkout/checkin) ── */}
          {canManage && deposit.status === "held" && (isCheckout || isActiveStay) && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/30">
              <p className="text-xs font-medium">Step 1: Inspect Unit</p>
              <Input
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                className="h-8 text-xs"
                placeholder="Inspection notes (optional)"
              />
              <Button size="sm" variant="outline" className="gap-1 w-full" onClick={handleInspect} disabled={updateDeposit.isPending}>
                <Check className="h-3 w-3" /> Mark as Inspected
              </Button>
            </div>
          )}

          {/* ── Release/Deduct step (Manager+ after inspection) ── */}
          {canManage && deposit.status === "inspected" && (
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              <p className="text-xs font-medium">Step 2: Release or Deduct</p>
              <Button size="sm" variant="outline" className="gap-1 w-full" onClick={handleRelease} disabled={updateDeposit.isPending}>
                <Check className="h-3 w-3" /> Release Full Deposit
              </Button>
              <Separator />
              <div className="space-y-1.5">
                <Label className="text-xs">Or deduct for damages</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={Number(deposit.amount_held)}
                    value={deductionAmount}
                    onChange={(e) => setDeductionAmount(e.target.value)}
                    className="h-8 w-24 text-xs"
                    placeholder="Amount"
                  />
                  <Input
                    value={deductionReason}
                    onChange={(e) => setDeductionReason(e.target.value)}
                    className="h-8 text-xs flex-1"
                    placeholder="Reason for deduction"
                  />
                </div>
                {/* Evidence upload */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><ImagePlus className="h-3 w-3" /> Evidence photos</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleEvidenceUpload}
                    disabled={uploadingEvidence}
                    className="h-8 text-xs"
                  />
                  {((deposit as any).deduction_evidence_urls ?? []).length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {((deposit as any).deduction_evidence_urls as string[]).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-0.5">
                          <ExternalLink className="h-3 w-3" /> Photo {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs w-full gap-1"
                  onClick={handleDeduct}
                  disabled={!deductionAmount || updateDeposit.isPending}
                >
                  <AlertTriangle className="h-3 w-3" /> Deduct & Return Remainder
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
