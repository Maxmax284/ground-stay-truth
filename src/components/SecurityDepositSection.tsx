import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useSecurityDeposit, useCreateSecurityDeposit, useUpdateSecurityDeposit } from "@/hooks/useSecurityDeposit";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { Shield, Check, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  held: "bg-warning/15 text-warning-foreground",
  inspected: "bg-primary/15 text-primary",
  released: "bg-success/15 text-success",
  deducted: "bg-destructive/15 text-destructive",
};

export function SecurityDepositSection({ bookingId, bookingState }: { bookingId: string; bookingState: string }) {
  const { role, user } = useAuth();
  const { data: deposit, isLoading } = useSecurityDeposit(bookingId);
  const { data: policies } = usePolicySettings();
  const createDeposit = useCreateSecurityDeposit();
  const updateDeposit = useUpdateSecurityDeposit();
  const { toast } = useToast();
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionReason, setDeductionReason] = useState("");

  const depositSetting = policies?.find((p) => p.key === "security_deposit_amount");
  const depositAmount = Number(depositSetting?.value ?? 0);
  const isRequired = String(policies?.find((p) => p.key === "security_deposit_required")?.value) === "true";

  // Don't show if deposit system is disabled
  if (depositAmount <= 0 && !deposit) return null;

  const canManage = permissions.canApproveOverride(role); // Manager+
  const isCheckout = bookingState === "completed";

  const handleCollect = async () => {
    try {
      await createDeposit.mutateAsync({ booking_id: bookingId, amount_held: depositAmount });
      toast({ title: "Security deposit collected" });
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

  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <Separator />
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Security Deposit</span>
        {isRequired && !deposit && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
      </div>

      {!deposit ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Security deposit: {formatPrice(depositAmount, policies)}
          </p>
          {canManage && (
            <Button size="sm" variant="outline" onClick={handleCollect} disabled={createDeposit.isPending}>
              Collect Deposit
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={`text-[10px] ${STATUS_COLORS[deposit.status] ?? ""}`}>
              {deposit.status}
            </Badge>
            <span className="text-sm">{formatPrice(deposit.amount_held, policies)} held</span>
            {deposit.amount_deducted > 0 && (
              <span className="text-xs text-destructive">(-{formatPrice(deposit.amount_deducted, policies)})</span>
            )}
          </div>
          {deposit.deduction_reason && <p className="text-xs text-muted-foreground">{deposit.deduction_reason}</p>}

          {/* Action buttons for Manager+ at checkout */}
          {canManage && deposit.status === "held" && (isCheckout || bookingState === "checked_in") && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/30">
              <p className="text-xs font-medium">Inspection Actions</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={handleRelease} disabled={updateDeposit.isPending}>
                  <Check className="h-3 w-3" /> Release Full
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Deduct amount</Label>
                <div className="flex gap-2">
                  <Input type="number" min={0} max={Number(deposit.amount_held)} value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} className="h-8 w-24 text-xs" placeholder="Amount" />
                  <Input value={deductionReason} onChange={(e) => setDeductionReason(e.target.value)} className="h-8 text-xs flex-1" placeholder="Reason" />
                  <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={handleDeduct} disabled={!deductionAmount || updateDeposit.isPending}>
                    <AlertTriangle className="h-3 w-3 mr-1" /> Deduct
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
