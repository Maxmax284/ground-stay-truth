import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, TrendingUp, BarChart3, PieChart, Layers, AlertCircle, DollarSign, Building, Calendar, Download } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart as RPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { getCurrencyConfig, formatPrice } from "@/lib/currency";
import { downloadCSV } from "@/lib/csvExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import { useReports } from "@/hooks/useReports";
import { useAuth } from "@/hooks/useAuth";
import { useAccountOverview } from "@/hooks/useAccountOverview";
import AccountSnapshotCards from "@/components/reports/AccountSnapshotCards";
import AccountRoleChart from "@/components/reports/AccountRoleChart";
import AccountActivityChart from "@/components/reports/AccountActivityChart";
import AccountDetailTable from "@/components/reports/AccountDetailTable";
import PaymentAnalytics from "@/components/reports/PaymentAnalytics";

const STATE_COLORS: Record<string, string> = {
  inquiry: "hsl(30, 15%, 60%)", soft_hold: "hsl(38, 55%, 65%)", pending_approval: "hsl(38, 90%, 50%)",
  pending_deposit: "hsl(38, 70%, 55%)", confirmed: "hsl(150, 45%, 40%)", checked_in: "hsl(210, 50%, 50%)",
  completed: "hsl(150, 15%, 60%)", cancelled: "hsl(0, 65%, 50%)", no_show: "hsl(0, 45%, 40%)",
};

const Reports = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [monthOffset, setMonthOffset] = useState(0);
  const reports = useReports(monthOffset);
  const { data: policies } = usePolicySettings();
  const { symbol: currencySymbol } = getCurrencyConfig(policies);

  const canSeeAccounts = role === "viewer" || role === "manager" || role === "admin";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("reports.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("reports.subtitle")}</p>
        </div>

        {canSeeAccounts ? (
          <Tabs defaultValue="operations">
            <TabsList>
              <TabsTrigger value="operations">{t("reports.accounts.operationsTab")}</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="accounts">{t("reports.accounts.tabLabel")}</TabsTrigger>
            </TabsList>

            <TabsContent value="operations">
              <OperationsTab
                monthOffset={monthOffset}
                setMonthOffset={setMonthOffset}
                reports={reports}
                t={t}
                currencySymbol={currencySymbol}
                policies={policies}
              />
            </TabsContent>

            <TabsContent value="payments">
              <PaymentAnalytics />
            </TabsContent>

            <TabsContent value="accounts">
              <AccountsTab role={role} />
            </TabsContent>
          </Tabs>
        ) : (
          <OperationsTab
            monthOffset={monthOffset}
            setMonthOffset={setMonthOffset}
            reports={reports}
            t={t}
            currencySymbol={currencySymbol}
            policies={policies}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

/* ── Operations Tab ── */
interface OperationsProps {
  monthOffset: number;
  setMonthOffset: (fn: (o: number) => number) => void;
  reports: ReturnType<typeof useReports>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  currencySymbol: string;
  policies: any;
}

const OperationsTab = ({ monthOffset, setMonthOffset, reports, t, currencySymbol, policies }: OperationsProps) => {
  const { isLoading, occupancyByDay, occupancyRate, revenueByUnit, stateDistribution, blockedVsBookable, rangeLabel, adr, revpar, forecastOccupancy, forecastLoading, rawBookings } = reports;

  const handleExportCSV = () => {
    const rows = rawBookings.map((b: any) => ({
      booking_id: b.id,
      unit: (b.units as any)?.name ?? "",
      check_in: b.check_in,
      check_out: b.check_out,
      state: b.state,
      total_price: b.price_override ?? b.total_price ?? "",
    }));
    downloadCSV(rows, `financial-report-${rangeLabel.replace(/\s+/g, "-")}.csv`);
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Month navigation + Export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isLoading || rawBookings.length === 0} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonthOffset((o) => o + 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">{rangeLabel}</span>
          <Button variant="outline" size="icon" disabled={monthOffset === 0} onClick={() => setMonthOffset((o) => o - 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("reports.occupancyRate")}
          value={isLoading ? null : `${occupancyRate}%`}
        />
        <KPICard
          icon={<DollarSign className="h-4 w-4" />}
          label="ADR"
          sublabel="Avg Daily Rate"
          value={isLoading ? null : formatPrice(adr, policies)}
        />
        <KPICard
          icon={<Building className="h-4 w-4" />}
          label="RevPAR"
          sublabel="Rev / Available Room"
          value={isLoading ? null : formatPrice(revpar, policies)}
        />
        <KPICard
          icon={<Calendar className="h-4 w-4" />}
          label="30-Day Forecast"
          sublabel="Projected occupancy"
          value={forecastLoading ? null : `${forecastOccupancy}%`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> {t("reports.occupancyRate")}
          </CardTitle>
          {!isLoading && <span className="text-2xl font-bold text-primary">{occupancyRate}%</span>}
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[200px] w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={occupancyByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                  formatter={(value: number, name: string) => name === "occupied" ? [`${value} unit(s)`, t("reports.occupied")] : [value, name]} />
                <Area type="monotone" dataKey="occupied" stroke="hsl(16, 60%, 42%)" fill="hsl(16, 60%, 42%)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> {t("reports.revenueByUnit")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[220px] w-full" /> : revenueByUnit.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("reports.noUnits")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueByUnit} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${currencySymbol}${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                    formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`, t("reports.revenue")]} />
                  <Bar dataKey="revenue" fill="hsl(150, 45%, 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" /> {t("reports.bookingStates")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[220px] w-full" /> : stateDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("reports.noBookings")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <RPieChart>
                  <Pie data={stateDistribution} dataKey="count" nameKey="state" cx="50%" cy="50%" outerRadius={80}
                    label={({ state, count }) => `${t(`states.${state}`)}: ${count}`} labelLine={false}>
                    {stateDistribution.map((entry) => (
                      <Cell key={entry.state} fill={STATE_COLORS[entry.state] ?? "hsl(30, 15%, 60%)"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                    formatter={(value: number, name: string) => [value, t(`states.${name}`)]} />
                </RPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> {t("reports.blockedVsBookable")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : blockedVsBookable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reports.noUnits")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={blockedVsBookable}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: t("reports.days"), angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }} />
                <Legend />
                <Bar dataKey="booked" stackId="a" fill="hsl(150, 45%, 40%)" name={t("reports.booked")} radius={[0, 0, 0, 0]} />
                <Bar dataKey="blocked" stackId="a" fill="hsl(38, 55%, 65%)" name={t("calendar.blocked")} />
                <Bar dataKey="maintenance" stackId="a" fill="hsl(0, 65%, 50%)" name={t("calendar.maintenance")} />
                <Bar dataKey="available" stackId="a" fill="hsl(30, 15%, 88%)" name={t("reports.available")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/* ── KPI Card ── */
const KPICard = ({ icon, label, sublabel, value }: { icon: React.ReactNode; label: string; sublabel?: string; value: string | null }) => (
  <Card>
    <CardContent className="pt-4 pb-3 px-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      {value === null ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <p className="text-xl font-bold text-foreground">{value}</p>
      )}
      {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
    </CardContent>
  </Card>
);

/* ── Accounts Tab ── */
const AccountsTab = ({ role }: { role: string | null }) => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAccountOverview();

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        <Skeleton className="h-[120px] w-full" />
        <Skeleton className="h-[260px] w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="mt-4">
        <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
          <span>{t("reports.accounts.loadError")}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      <AccountSnapshotCards snapshot={data.snapshot} />

      {data.roleDistribution && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AccountRoleChart data={data.roleDistribution} />
          {data.activityBreakdown && <AccountActivityChart data={data.activityBreakdown} />}
        </div>
      )}

      {role === "admin" && data.accounts && (
        <AccountDetailTable accounts={data.accounts} />
      )}
    </div>
  );
};

export default Reports;