import { useTranslation } from "react-i18next";
import { Users, UserCheck, UserX, CalendarCheck, History, AlertCircle, Shield, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountSnapshot } from "@/hooks/useAccountOverview";

interface Props {
  snapshot: AccountSnapshot;
}

const AccountSnapshotCards = ({ snapshot }: Props) => {
  const { t } = useTranslation();

  const cards = [
    { label: t("reports.accounts.totalAccounts"), value: snapshot.totalAccounts, icon: Users },
    { label: t("reports.accounts.totalGuests"), value: snapshot.totalGuests, icon: UserCheck },
    { label: t("reports.accounts.totalStaff"), value: snapshot.totalStaff, icon: Shield },
    { label: t("reports.accounts.totalAdmins"), value: snapshot.totalAdmins, icon: Eye },
    { label: t("reports.accounts.activeAccounts"), value: snapshot.activeAccounts, icon: UserCheck },
    { label: t("reports.accounts.dormantAccounts"), value: snapshot.dormantAccounts, icon: UserX },
    { label: t("reports.accounts.activeBookings"), value: snapshot.withActiveBookings, icon: CalendarCheck },
    { label: t("reports.accounts.bookingHistory"), value: snapshot.withBookingHistory, icon: History },
    { label: t("reports.accounts.zeroActivity"), value: snapshot.zeroActivity, icon: AlertCircle },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted">
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold font-stat text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AccountSnapshotCards;
