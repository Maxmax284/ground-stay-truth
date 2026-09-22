import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { GuestNowCard, type NowState } from "@/components/GuestNowCard";
import { GroundRadar, type RadarLeg } from "@/components/GroundRadar";
import { WhileYouWaitTab } from "@/components/WhileYouWaitTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plane, Radar, Smartphone, Waves } from "lucide-react";

const NOW_STATES: NowState[] = ["deposit", "flight", "onsite", "quiet"];
const RADAR_LEGS: RadarLeg[] = ["inbound", "transit", "island", "arrived"];

export default function GuestPortalPreview() {
  const { t } = useTranslation();
  const [nowState, setNowState] = useState<NowState>("flight");
  const [radarLeg, setRadarLeg] = useState<RadarLeg>("island");

  const today = useMemo(() => new Date(), []);
  const checkIn = useMemo(() => today.toISOString(), [today]);
  const checkOut = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 21);
    return d.toISOString();
  }, [today]);

  const radarCopy = {
    inbound: t(
      "guestPreview.radarInbound",
      "Long haul leg is being tracked. We watch the plane — the guest does not need to keep the page open."
    ),
    transit: t(
      "guestPreview.radarTransit",
      "Mainland transit — no driver hunt yet. Next move is the Bangkok Airways hop to Samui."
    ),
    island: t(
      "guestPreview.radarIsland",
      "Samui landing is live. Once the guest lands, one tap alerts the front desk and driver."
    ),
    arrived: t(
      "guestPreview.radarArrived",
      "On island ground. Bags first, then the meeting point card takes over."
    ),
  } satisfies Record<RadarLeg, string>;

  return (
    <DashboardLayout>
      <div className="space-y-5" data-ai-focus="guest-portal-preview">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {t("guestPreview.title", "Guest Portal Preview")}
              </h1>
              <Badge variant="outline" className="uppercase text-[10px] tracking-wider">
                {t("guestPreview.adminOnly", "Admin only")}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t(
                "guestPreview.subtitle",
                "Preview the guest Now card, Ground Radar radar, and While You Wait screen without opening a guest account."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <Smartphone className="h-4 w-4 text-primary" />
            {t("guestPreview.phoneFrame", "Phone view")}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_1fr]">
          <section className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Smartphone className="h-4 w-4 text-primary" />
                {t("guestPreview.liveSurface", "Guest surface")}
              </div>
              <Select value={nowState} onValueChange={(value) => setNowState(value as NowState)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOW_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {t(`guestPreview.now.${state}`, state)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mx-auto w-full max-w-sm rounded-[2rem] border border-border bg-background p-3 shadow-lg">
              <div className="rounded-[1.45rem] border border-border bg-card p-3">
                <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>LMT CampStay</span>
                  <span>{t("guestPreview.preview", "Preview")}</span>
                </div>
                <div className="space-y-3">
                  <GuestNowCard
                    state={nowState}
                    unitName="Standard Single 12"
                    checkIn={checkIn}
                    checkOut={checkOut}
                    nightsAway={nowState === "onsite" ? null : 0}
                    contactEmail="guest@example.com"
                    messagingLinked
                    onGo={() => undefined}
                  />
                  {nowState === "flight" && (
                    <div className="rounded-lg border border-primary/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Plane className="h-4 w-4 text-primary" />
                          {t("guestFlight.title", "Your flight")}
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          PG5125
                        </Badge>
                      </div>
                      <GroundRadar
                        intlFlight="EK384"
                        finalFlight="PG5125"
                        leg="island"
                        statusLabel={t("guestPreview.live", "Live")}
                        etaLabel="Today 16:35"
                        delayMinutes={8}
                        gate="A3"
                        terminal="Domestic"
                        altitudeLabel="DESCENT"
                        transitLine={radarCopy.island}
                      />
                      <Button className="mt-3 w-full" size="sm">
                        {t("guestPreview.confirmLanding", "I've landed")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0 space-y-4">
            <Tabs defaultValue="radar" className="space-y-4">
              <TabsList className="flex-wrap">
                <TabsTrigger value="radar" className="gap-1.5">
                  <Radar className="h-3.5 w-3.5" />
                  {t("guestPreview.radarTab", "Radar")}
                </TabsTrigger>
                <TabsTrigger value="wait" className="gap-1.5">
                  <Waves className="h-3.5 w-3.5" />
                  {t("whileYouWait.tab", "While You Wait")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="radar" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t("guestPreview.radarTitle", "Ground Radar route card")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("guestPreview.radarSubtitle", "Switch legs to check the landing and transit language.")}
                    </p>
                  </div>
                  <Select value={radarLeg} onValueChange={(value) => setRadarLeg(value as RadarLeg)}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RADAR_LEGS.map((leg) => (
                        <SelectItem key={leg} value={leg}>
                          {t(`guestPreview.leg.${leg}`, leg)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <GroundRadar
                  intlFlight="EK384"
                  finalFlight="PG5125"
                  leg={radarLeg}
                  statusLabel={radarLeg === "arrived" ? t("guestPreview.landed", "Landed") : t("guestPreview.tracking", "Tracking")}
                  etaLabel={radarLeg === "arrived" ? "Landed 16:31" : "Today 16:35"}
                  delayMinutes={radarLeg === "arrived" ? null : 8}
                  gate={radarLeg === "transit" ? "B4" : "A3"}
                  terminal={radarLeg === "transit" ? "BKK" : "USM"}
                  altitudeLabel={radarLeg === "arrived" ? "ON GROUND" : "DESCENT"}
                  transitLine={radarCopy[radarLeg]}
                />
              </TabsContent>

              <TabsContent value="wait" className="space-y-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-sm font-semibold text-foreground">
                    {t("guestPreview.waitTitle", "While You Wait")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("guestPreview.waitSubtitle", "Same live Samui conditions screen the guest sees while travelling.")}
                  </p>
                </div>
                <WhileYouWaitTab />
              </TabsContent>
            </Tabs>

            <Separator />
            <p className="text-xs text-muted-foreground">
              {t(
                "guestPreview.noGuestWrites",
                "Preview mode uses sample booking data and does not write to guest bookings, messages, payments, pickup records, or flight records."
              )}
            </p>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}