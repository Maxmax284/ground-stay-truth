import { useTranslation } from "react-i18next";
import { PieChart as RPieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "lucide-react";
import type { RoleDistributionItem } from "@/hooks/useAccountOverview";

const ROLE_COLORS: Record<string, string> = {
  guest: "hsl(30, 15%, 60%)",
  viewer: "hsl(210, 50%, 50%)",
  maintenance: "hsl(38, 55%, 65%)",
  front_desk: "hsl(150, 45%, 40%)",
  front_desk_supervisor: "hsl(150, 30%, 50%)",
  manager: "hsl(16, 60%, 42%)",
  admin: "hsl(0, 72%, 40%)",
};

interface Props {
  data: RoleDistributionItem[];
}

const AccountRoleChart = ({ data }: Props) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary" />
          {t("reports.accounts.roleDistribution")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <RPieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="role"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={({ role, count }) => `${t(`roles.${role}`)}: ${count}`}
              labelLine={false}
            >
              {data.map((entry) => (
                <Cell key={entry.role} fill={ROLE_COLORS[entry.role] ?? "hsl(30, 15%, 60%)"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
              formatter={(value: number, name: string) => [value, t(`roles.${name}`)]}
            />
          </RPieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default AccountRoleChart;
