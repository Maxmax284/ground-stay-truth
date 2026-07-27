import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, CreditCard, Building2, Copy, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDepositPolicy } from "@/lib/depositPolicy";
import { GuestPaymentButton } from "@/components/GuestPaymentButton";
import { toast } from "sonner";

interface GuestDepositSectionProps {
  policies?: any[];
  depositAmount: number | null;
  bookingId: string;
}

function usePolicyValue(policies: any[] | undefined, key: string): string {
  return useMemo(() => {
    const s = (policies ?? []).find((p: any) => p.key === key);
    return s ? String(s.value).replace(/^"|"$/g, "") : "";
  }, [policies, key]);
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground break-all">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function GuestDepositSection({ policies, depositAmount, bookingId }: GuestDepositSectionProps) {
  const { t } = useTranslation();
  const depositPol = getDepositPolicy(policies ?? []);

  const currencySymbol = usePolicyValue(policies, "currency_symbol") || "฿";
  const bankName = usePolicyValue(policies, "bank_transfer_bank_name");
  const accountName = usePolicyValue(policies, "bank_transfer_account_name");
  const accountNumber = usePolicyValue(policies, "bank_transfer_account_number");
  const bankNotes = usePolicyValue(policies, "bank_transfer_notes");

  const hasBankDetails = !!(bankName || accountNumber);
  const hasOnline = depositPol.onlineEnabled;
  const isOnlineRequired = depositPol.effectiveMode === "online_required";
  // When online is required, never show bank transfer tab — guests must pay online
  const showTabs = hasOnline && hasBankDetails && !isOnlineRequired;

  // Determine the default/only tab
  const defaultTab = hasOnline ? "online" : "bank";

  return (
    <div
      id={`deposit-${bookingId}`}
      data-deposit-section=""
      className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2.5 scroll-mt-24"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Info className="h-4 w-4 shrink-0" />
        {t("deposit.guestTitle")}
      </div>

      {depositAmount != null && (
        <p className="text-sm font-semibold text-foreground">
          {t("deposit.guestAmount", { amount: `${currencySymbol}${depositAmount.toFixed(0)}` })}
        </p>
      )}

      {showTabs ? (
        <Tabs defaultValue={defaultTab} className="mt-1">
          <TabsList className="w-full h-8 bg-primary/10">
            <TabsTrigger value="online" className="flex-1 gap-1.5 text-xs data-[state=active]:bg-background">
              <CreditCard className="h-3.5 w-3.5" />
              {t("deposit.payOnlineTab", { defaultValue: "Pay Online" })}
            </TabsTrigger>
            <TabsTrigger value="bank" className="flex-1 gap-1.5 text-xs data-[state=active]:bg-background">
              <Building2 className="h-3.5 w-3.5" />
              {t("deposit.bankTransferTab", { defaultValue: "Bank Transfer" })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="online" className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("deposit.onlineInstructions", { defaultValue: "Pay securely with your credit or debit card." })}
            </p>
            <GuestPaymentButton
              bookingId={bookingId}
              depositAmount={depositAmount}
              currencySymbol={currencySymbol}
            />
          </TabsContent>
          <TabsContent value="bank" className="mt-2">
            <BankTransferDetails
              bankName={bankName}
              accountName={accountName}
              accountNumber={accountNumber}
              bankNotes={bankNotes}
              bookingId={bookingId}
            />
          </TabsContent>
        </Tabs>
      ) : hasOnline ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {isOnlineRequired
              ? t("deposit.guestInstructionsOnlineRequired", { defaultValue: "Online payment is required to hold your booking. Please pay securely below." })
              : t("deposit.guestInstructionsOnlineOptional")}
          </p>
          <GuestPaymentButton
            bookingId={bookingId}
            depositAmount={depositAmount}
            currencySymbol={currencySymbol}
          />
        </div>
      ) : hasBankDetails ? (
        <BankTransferDetails
          bankName={bankName}
          accountName={accountName}
          accountNumber={accountNumber}
          bankNotes={bankNotes}
          bookingId={bookingId}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("deposit.guestInstructions")}
        </p>
      )}
    </div>
  );
}

function BankTransferDetails({
  bankName, accountName, accountNumber, bankNotes, bookingId,
}: {
  bankName: string; accountName: string; accountNumber: string; bankNotes: string; bookingId: string;
}) {
  const { t } = useTranslation();
  // Use first 8 chars of booking ID as reference
  const reference = bookingId.slice(0, 8).toUpperCase();

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {t("deposit.bankTransferTitle", { defaultValue: "Bank Transfer Details" })}
      </p>
      <CopyableField label={t("deposit.bankName", { defaultValue: "Bank" })} value={bankName} />
      <CopyableField label={t("deposit.accountName", { defaultValue: "Account Name" })} value={accountName} />
      <CopyableField label={t("deposit.accountNumber", { defaultValue: "Account Number" })} value={accountNumber} />
      <CopyableField label={t("deposit.reference", { defaultValue: "Reference" })} value={reference} />
      {bankNotes && (
        <p className="text-xs text-muted-foreground mt-2 italic">{bankNotes}</p>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        {t("deposit.bankTransferNote", { defaultValue: "Please include the reference when making your transfer. Your booking will be confirmed once payment is verified." })}
      </p>
    </div>
  );
}
