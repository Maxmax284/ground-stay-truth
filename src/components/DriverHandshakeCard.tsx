import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { meetingPointFor } from "@/lib/meetingPoints";
import { formatCampLabeled } from "@/lib/timezone";
import { BadgeCheck, Car, MapPin, Phone, MessageCircle, UserRound, ShieldCheck } from "lucide-react";

export interface HandshakeDriver {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  vehicle_type?: string | null;
  license_plate?: string | null;
  photo_url?: string | null;
}

interface Props {
  driver?: HandshakeDriver | null;
  airportCode?: string | null;
  landedAt?: string | null;
  /** Set once the guest has said they're out of the terminal. */
  readyAt?: string | null;
  /** Staff/driver confirmed the handover. */
  collectedAt?: string | null;
  onReady?: () => void;
  readyPending?: boolean;
}

/**
 * Post-landing handshake. Shown the instant a guest confirms they're on the
 * ground: front desk alerted, who is collecting them, the plate, and exactly
 * where to stand. Staff still own the driver assignment — this only displays it.
 */
export function DriverHandshakeCard({ driver, airportCode, landedAt }: Props) {
  const { t } = useTranslation();
  const meeting = meetingPointFor(airportCode);
  const digits = (v?: string | null) => (v ? v.replace(/\D/g, "") : "");

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {t("handshake.title", "Front desk alerted")}
            </span>
          </div>
          {landedAt && (
            <span className="text-[10px] text-muted-foreground">{formatCampLabeled(landedAt)}</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            "handshake.reassure",
            "We know you're on the ground. You don't need to keep this page open — we'll buzz your phone when your driver is outside."
          )}
        </p>

        <Separator />

        {driver ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {driver.photo_url ? (
                <img
                  src={driver.photo_url}
                  alt={driver.name}
                  className="h-11 w-11 rounded-full object-cover border border-primary/30"
                />
              ) : (
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                  <UserRound className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{driver.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("handshake.yourDriver", "Your driver")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {driver.license_plate && (
                <Badge variant="outline" className="text-[11px] font-mono gap-1">
                  <Car className="h-3 w-3" /> {driver.license_plate}
                </Badge>
              )}
              {driver.vehicle_type && (
                <Badge variant="secondary" className="text-[11px]">{driver.vehicle_type}</Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {driver.phone && (
                <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                  <a href={`tel:${driver.phone}`}>
                    <Phone className="h-3 w-3" /> {t("handshake.call", "Call driver")}
                  </a>
                </Button>
              )}
              {driver.whatsapp && (
                <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                  <a href={`https://wa.me/${digits(driver.whatsapp)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-3 w-3" /> {t("handshake.whatsapp", "WhatsApp driver")}
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "handshake.noDriverYet",
                "The front desk is assigning your driver now. Their name and plate appear here the moment it's set — no need to refresh."
              )}
            </p>
          </div>
        )}

        {meeting && (
          <div className="rounded-lg border border-primary/20 bg-card p-2.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">{meeting.point}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{meeting.detail}</p>
            <p className="text-[10px] text-muted-foreground">{meeting.label}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
