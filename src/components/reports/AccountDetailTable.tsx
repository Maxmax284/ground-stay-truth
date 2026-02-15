import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ArrowUpDown, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AccountDetail } from "@/hooks/useAccountOverview";

interface Props {
  accounts: AccountDetail[];
}

type SortField = "name" | "role" | "lastLogin" | "totalBookings" | "createdAt";

const AccountDetailTable = ({ accounts }: Props) => {
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sorted = [...accounts].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    switch (sortField) {
      case "name":
        return dir * (a.name ?? "").localeCompare(b.name ?? "");
      case "role":
        return dir * a.role.localeCompare(b.role);
      case "lastLogin": {
        const aTime = a.lastLogin ? new Date(a.lastLogin).getTime() : 0;
        const bTime = b.lastLogin ? new Date(b.lastLogin).getTime() : 0;
        return dir * (aTime - bTime);
      }
      case "totalBookings":
        return dir * (a.totalBookings - b.totalBookings);
      case "createdAt":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      default:
        return 0;
    }
  });

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground" onClick={() => handleSort(field)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          {t("reports.accounts.detailTable")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortButton field="name" label={t("reports.accounts.name")} /></TableHead>
              <TableHead className="hidden md:table-cell">{t("reports.accounts.email")}</TableHead>
              <TableHead><SortButton field="role" label={t("reports.accounts.role")} /></TableHead>
              <TableHead><SortButton field="lastLogin" label={t("reports.accounts.lastLogin")} /></TableHead>
              <TableHead className="text-center">{t("reports.accounts.hasActiveBooking")}</TableHead>
              <TableHead><SortButton field="totalBookings" label={t("reports.accounts.totalBookings")} /></TableHead>
              <TableHead className="hidden lg:table-cell"><SortButton field="createdAt" label={t("reports.accounts.createdDate")} /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((acc) => (
              <TableRow key={acc.userId}>
                <TableCell className="font-medium">{acc.name || t("common.noName")}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{acc.email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{t(`roles.${acc.role}`)}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {acc.lastLogin ? format(new Date(acc.lastLogin), "MMM d, yyyy") : "—"}
                </TableCell>
                <TableCell className="text-center">
                  {acc.hasActiveBooking ? (
                    <Badge className="bg-success text-success-foreground text-xs">{t("common.yes")}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">{t("common.no")}</span>
                  )}
                </TableCell>
                <TableCell className="font-stat">{acc.totalBookings}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {format(new Date(acc.createdAt), "MMM d, yyyy")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default AccountDetailTable;
