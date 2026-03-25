import { useState } from "react";
import { ChevronLeft, ChevronRight, DollarSign, TrendingDown, CreditCard, PieChart as PieIcon, Building } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart as RPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaymentAnalytics } from "@/hooks/usePaymentAnalytics";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { getCurrencyConfig, formatPrice } from "@/lib/currency";
import { PAYMENT_TYPE_LABELS, type PaymentType } from "@/lib/paymentTypes";

const METHOD_COLORS: Record<string, string> = {
  bank_transfer: "hsl(210, 50%, 50%)",
  cash: "hsl(150, 45%, 40%)",
  credit_card: "hsl(38, 90%, 50%)",
  offline: "hsl(30, 15%, 60%)",
  stripe: "hsl(260, 60%, 55%)",
  paypal: "hsl(200, 80%, 50%)",
  unknown: "hsl(0, 0%, 60%)",
};

const TYPE_COLORS: Record<string, string> = {
  deposit: "hsl(150, 45%, 40%)",
  balance: "hsl(210, 50%, 50%)",
  addon: "hsl(38, 90%, 50%)",
  security_deposit: "hsl(16, 60%, 42%)",
};

const PaymentAnalytics = () => {
  const [monthOffset, setMonthOffset] = useState(0);
  const analytics = usePaymentAnalytics(monthOffset);
  const { data: policies } = usePolicySettings();
  const { symbol: currencySymbol } = getCurrencyConfig(policies);

  const { isLoading, rangeLabel, revenueTrend, totalGross, totalRefunds, totalNet, refundRate, refundCount, totalCount, methodDistribution, typeDistribution, outstandingByUnit } = analytics;

  const totalOutstanding = outstandingByUnit.reduce((s, u) => s + u.outstanding, 0);

  return (
    <div className="space-y-6 mt-4">
      {/* Month navigation */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="icon" onClick={() => setMonthOffset((o) => o + 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[120px] text-center">{rangeLabel}</span>
        <Button variant="outline" size="icon" disabled={monthOffset === 0} onClick={() => setMonthOffset((o) => o - 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<DollarSign className="h-4 w-4" />} label="Gross Revenue" value={isLoading ? null : formatPrice(totalGross, policies)} />
        <KPICard icon={<DollarSign className="h-4 w-4" />} label="Net Revenue" value={isLoading ? null : formatPrice(totalNet, policies)} />
        <KPICard icon={<TrendingDown className="h-4 w-4" />} label="Refund Rate" sublabel={`${refundCount} of ${totalCount} payments`} value={isLoading ? null : `${refundRate}%`} />
        <KPICard icon={<Building className="h-4 w-4" />} label="Outstanding" sublabel="Across active bookings" value={isLoading ? null : formatPrice(totalOutstanding, policies)} />
      </div>

      {/* Revenue Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Revenue Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${currencySymbol}${v}`} />
                <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                  formatter={(value: number, name: string) => [`${currencySymbol}${value.toLocaleString()}`, name === "net" ? "Net" : name === "revenue" ? "Gross" : "Refunds"]} />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Gross" stroke="hsl(150, 45%, 40%)" fill="hsl(150, 45%, 40%)" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="refunds" name="Refunds" stroke="hsl(0, 65%, 50%)" fill="hsl(0, 65%, 50%)" fillOpacity={0.1} strokeWidth={2} />
                <Area type="monotone" dataKey="net" name="Net" stroke="hsl(210, 50%, 50%)" fill="hsl(210, 50%, 50%)" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Method Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[220px] w-full" /> : methodDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <RPieChart>
                  <Pie data={methodDistribution} dataKey="count" nameKey="method" cx="50%" cy="50%" outerRadius={80}
                    label={({ method, count }) => `${method}: ${count}`} labelLine={false}>
                    {methodDistribution.map((entry) => (
                      <Cell key={entry.method} fill={METHOD_COLORS[entry.method] ?? METHOD_COLORS.unknown} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }} />
                </RPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-primary" /> Payment Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[220px] w-full" /> : typeDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <RPieChart>
                  <Pie data={typeDistribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80}
                    label={({ type, count }) => `${PAYMENT_TYPE_LABELS[type as PaymentType] ?? type}: ${count}`} labelLine={false}>
                    {typeDistribution.map((entry) => (
                      <Cell key={entry.type} fill={TYPE_COLORS[entry.type] ?? "hsl(30, 15%, 60%)"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                    formatter={(value: number, name: string) => [value, PAYMENT_TYPE_LABELS[name as PaymentType] ?? name]} />
                </RPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Outstanding Balances by Unit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" /> Outstanding Balances by Unit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : outstandingByUnit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding balances</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={outstandingByUnit} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${currencySymbol}${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                  formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`, "Outstanding"]} />
                <Bar dataKey="outstanding" fill="hsl(0, 65%, 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const KPICard = ({ icon, label, sublabel, value }: { icon: React.ReactNode; label: string; sublabel?: string; value: string | null }) => (
  <Card>
    <CardContent className="pt-4 pb-3 px-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      {value === null ? <Skeleton className="h-7 w-20" /> : <p className="text-xl font-bold text-foreground">{value}</p>}
      {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
    </CardContent>
  </Card>
);

export default PaymentAnalytics;
