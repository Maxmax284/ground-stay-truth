/**
 * Staff Handling Panel — plain-English switches for things staff already
 * settled in person. No money math, no state machine, no guest visibility.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HandCoins, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  OFFLINE_ACK_ITEMS,
  readOfflineAcks,
  isPayOnArrival,
  type OfflineAckItem,
} from "@/lib/staffMarkers";
import { useSetPayOnArrival, useSetOfflineAcknowledgement } from "@/hooks/useBookingMarkers";
import { formatCampShort } from "@/lib/timezone";

interface Props {
  bookingId: string;
  booking: any;
  canEdit: boolean;
}

export function StaffHandlingPanel({ bookingId, booking, canEdit }: Props) {
  const { t } = useTranslation();
  const acks = readOfflineAcks(booking?.offline_acknowledgements);
  const payOnArrival = isPayOnArrival(booking);
  const setPay = useSetPayOnArrival();
  const setAck = useSetOfflineAcknowledgement();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("staffHandling.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("staffHandling.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pay on arrival */}
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <HandCoins className="h-3.5 w-3.5 text-primary" /> {t("staffHandling.payOnArrival.title")}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("staffHandling.payOnArrival.help")}
              </p>
            </div>
            <Switch
              checked={payOnArrival}
              disabled={!canEdit || setPay.isPending}
              onCheckedChange={(v) =>
                setPay.mutate({ bookingId, value: v, reason: reasons.pay_on_arrival })
              }
            />
          </div>
          {canEdit && !payOnArrival && (
            <Input
              className="h-8 text-xs"
              placeholder={t("staffHandling.payOnArrival.notePlaceholder")}
              value={reasons.pay_on_arrival ?? ""}
              onChange={(e) => setReasons((r) => ({ ...r, pay_on_arrival: e.target.value }))}
            />
          )}
          {payOnArrival && (
            <Badge variant="outline" className="text-[10px]">
              {t("staffHandling.payOnArrival.badge")}
            </Badge>
          )}
        </div>

        {/* Offline acknowledgements */}
        <div className="space-y-2">
          {OFFLINE_ACK_ITEMS.map((item: OfflineAckItem) => {
            const rec = acks[item];
            return (
              <div key={item} className="rounded-md border border-border/60 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="text-sm font-medium">{t(`staffHandling.ack.${item}`)}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t(`staffHandling.ack.${item}Help`)}
                    </p>
                    {rec && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t("staffHandling.ack.confirmedBy", { by: rec.by ?? t("common.staff"), at: formatCampShort(rec.at) })}
                        {rec.reason ? ` · ${rec.reason}` : ""}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={!!rec}
                    disabled={!canEdit || setAck.isPending}
                    onCheckedChange={(v) =>
                      setAck.mutate({ bookingId, item, value: v, reason: reasons[item] })
                    }
                  />
                </div>
                {canEdit && !rec && (
                  <Input
                    className="h-8 text-xs"
                    placeholder={t("staffHandling.ack.notePlaceholder")}
                    value={reasons[item] ?? ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [item]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
