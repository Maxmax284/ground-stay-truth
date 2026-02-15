import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import type { ActivityBreakdown } from "@/hooks/useAccountOverview";

interface Props {
  data: ActivityBreakdown;
}

const AccountActivityChart = ({ data }: Props) => {
  const { t } = useTranslation();

  const chartData = [
    {
      category: t("reports.accounts.totalGuests"),
      [t("reports.accounts.active")]: data.activeGuests,
      [t("reports.accounts.dormant")]: data.dormantGuests,
    },
    {
      category: t("reports.accounts.totalStaff"),
      [t("reports.accounts.active")]: data.activeStaff,
      [t("reports.accounts.dormant")]: data.dormantStaff,
    },
  ];

  const activeLabel = t("reports.accounts.active");
  const dormantLabel = t("reports.accounts.dormant");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          {t("reports.accounts.activityBreakdown")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
            <XAxis dataKey="category" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }} />
            <Legend />
            <Bar dataKey={activeLabel} fill="hsl(150, 45%, 40%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey={dormantLabel} fill="hsl(30, 15%, 60%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default AccountActivityChart;
