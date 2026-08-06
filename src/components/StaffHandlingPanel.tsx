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
import {
  OFFLINE_ACK_ITEMS,
  OFFLINE_ACK_LABELS,
  OFFLINE_ACK_HELP,
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
          Handled by staff
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Turn these on for anything already sorted in person. It stops the Front Desk
          flagging it as a problem. Amounts owed do not change.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pay on arrival */}
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <HandCoins className="h-3.5 w-3.5 text-primary" /> Paying on arrival
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Guest settles at the desk. The balance stays visible, but it stops reading
                as overdue before they get here.
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
              placeholder="Optional note (e.g. agreed with guest over WhatsApp)"
              value={reasons.pay_on_arrival ?? ""}
              onChange={(e) => setReasons((r) => ({ ...r, pay_on_arrival: e.target.value }))}
            />
          )}
          {payOnArrival && (
            <Badge variant="outline" className="text-[10px]">
              Front Desk shows "Paying on arrival"
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
                    <Label className="text-sm font-medium">{OFFLINE_ACK_LABELS[item]}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {OFFLINE_ACK_HELP[item]}
                    </p>
                    {rec && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Confirmed by {rec.by ?? "staff"} · {formatCampShort(rec.at)}
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
                    placeholder="Optional note (e.g. bank transfer received 3 Aug)"
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
