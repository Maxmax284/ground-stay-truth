import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  HelpCircle,
  Plane,
  Ship,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Circle,
  Copy,
  Printer,
  MessageSquare,
} from "lucide-react";
import { useAirportPickup } from "@/hooks/useAirportPickups";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Stage =
  | "pre_departure"
  | "bkk"
  | "dmk"
  | "urt"
  | "ferry"
  | "pier"
  | "usm"
  | "arrived"
  | null;

type ScenarioKey = "bkk-usm" | "dmk-usm" | "urt-ferry" | "usm-direct" | null;

interface Props {
  bookingId?: string;
}

/**
 * Guest-facing FAQ explaining the transit-vs-arrival distinction.
 * BKK / DMK / URT are mainland transit checkpoints.
 * USM (Koh Samui Airport) and the island piers are the only true "arrived" points.
 *
 * When given a bookingId, it auto-detects the guest's current checkpoint,
 * shows a Next-Step timeline, highlights the matching scenario, and exposes
 * copy-to-staff scripts plus a printable Arrival Instructions sheet.
 */
export function ArrivalRouteFAQ({ bookingId }: Props = {}) {
  const { t, i18n } = useTranslation();
  const { data: pickup } = useAirportPickup(bookingId ?? null);
  const [scriptStage, setScriptStage] = useState<Stage>(null);

  // Derive current stage from pickup data
  const stage: Stage = useMemo(() => {
    if (!pickup) return null;
    if (pickup.status === "completed") return "arrived";
    if (pickup.status === "cancelled") return null;

    const landed = !!pickup.guest_landed_at;
    const airport = pickup.confirmed_airport?.toLowerCase() ?? null;
    const locType = pickup.arrival_location_type;
    const locName = pickup.arrival_location_name?.toLowerCase() ?? "";
    const arrivalType = pickup.arrival_type;

    if (!landed) return "pre_departure";
    if (airport === "usm") return "usm";
    if (airport === "dmk") return "dmk";
    if (airport === "urt" || airport === "surat_thani" || airport === "suratthani") return "urt";
    if (airport === "bkk") return "bkk";
    if (
      locType === "pier" ||
      arrivalType === "ferry" ||
      locName.includes("nathon") ||
      locName.includes("lipa")
    )
      return "pier";
    return "pre_departure";
  }, [pickup]);

  // Derive matching scenario for highlight
  const matchedScenario: ScenarioKey = useMemo(() => {
    if (!stage) return null;
    if (stage === "usm") return "usm-direct";
    if (stage === "bkk") return "bkk-usm";
    if (stage === "dmk") return "dmk-usm";
    if (stage === "urt" || stage === "ferry" || stage === "pier") return "urt-ferry";
    return null;
  }, [stage]);

  const showStageUI = !!bookingId && !!pickup && pickup.status !== "cancelled";

  return (
    <Card className="border-primary/20 print:border-foreground print:shadow-none">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            {t("arrivalFAQ.title", { defaultValue: "Getting to Koh Samui — Quick FAQ" })}
          </span>
          <Badge variant="secondary" className="text-[10px] ml-auto print:hidden">
            {t("arrivalFAQ.badge", { defaultValue: "Transit vs. Arrival" })}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("arrivalFAQ.lead", {
            defaultValue:
              "Only USM (Koh Samui Airport) and the island piers count as your final arrival. Everything else is still in transit — even if you've already landed in Thailand.",
          })}
        </p>

        {/* Stage timeline — only when we have booking context */}
        {showStageUI && stage && stage !== "arrived" && (
          <NextStepTimeline stage={stage} t={t} />
        )}

        {showStageUI && stage === "arrived" && (
          <div className="rounded-md border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.08)] p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
            <span className="text-xs text-foreground">
              {t("arrivalFAQ.arrivedNote", {
                defaultValue: "You've arrived. No further transit steps needed.",
              })}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 print:hidden">
          {showStageUI && stage && stage !== "pre_departure" && stage !== "arrived" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setScriptStage(stage)}
              className="h-8 text-xs"
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              {t("arrivalFAQ.messageStaff", { defaultValue: "Message staff at this stage" })}
            </Button>
          )}
          {bookingId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => printArrivalSheet(bookingId, i18n.language, t, pickup)}
              className="h-8 text-xs"
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              {t("arrivalFAQ.printSheet", { defaultValue: "Print arrival sheet" })}
            </Button>
          )}
        </div>

        <Accordion
          type="single"
          collapsible
          className="w-full"
          defaultValue={matchedScenario ?? undefined}
        >
          <AccordionItem value="why" className="border-b-border">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {t("arrivalFAQ.q.why", {
                  defaultValue: "Why doesn't BKK / DMK / URT count as \"arrived\"?",
                })}
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                {t("arrivalFAQ.a.why", {
                  defaultValue:
                    "Those airports are on the Thai mainland. You still need a connecting flight or a ferry to reach the island. Until your feet hit Samui, the team treats you as in transit — pickup isn't dispatched yet, but staff can see your route.",
                })}
              </p>
              <ul className="space-y-1 pl-1">
                <li><strong className="text-foreground">BKK</strong> — Bangkok Suvarnabhumi</li>
                <li><strong className="text-foreground">DMK</strong> — Don Mueang (budget)</li>
                <li><strong className="text-foreground">URT</strong> — Surat Thani (mainland — ferry to Samui)</li>
                <li><strong className="text-foreground">USM ✓</strong> — Koh Samui Airport (arrived)</li>
                <li><strong className="text-foreground">Nathon / Lipa Noi ✓</strong> — Samui ferry piers (arrived)</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <ScenarioItem
            value="bkk-usm"
            highlighted={matchedScenario === "bkk-usm"}
            icon={<Plane className="h-3.5 w-3.5 text-primary" />}
            title={t("arrivalFAQ.s.bkkUsm.title", {
              defaultValue: "Scenario: BKK → USM (direct connection)",
            })}
            t={t}
          >
            <p>
              {t("arrivalFAQ.s.bkkUsm.body", {
                defaultValue:
                  "You land at BKK, clear immigration, then catch your domestic leg to Samui (USM). The system shows you as in transit — Bangkok until USM lands. Once USM lands, status flips to arrived and pickup goes live.",
              })}
            </p>
          </ScenarioItem>

          <ScenarioItem
            value="dmk-usm"
            highlighted={matchedScenario === "dmk-usm"}
            icon={<Plane className="h-3.5 w-3.5 text-primary" />}
            title={t("arrivalFAQ.s.dmkUsm.title", {
              defaultValue: "Scenario: DMK → USM (budget Bangkok route)",
            })}
            t={t}
          >
            <p>
              {t("arrivalFAQ.s.dmkUsm.body", {
                defaultValue:
                  "Don Mueang is Bangkok's second airport — usually cheaper, mostly budget carriers. Same rule: landing at DMK keeps you in transit. Final arrival is USM. Heads up: BKK and DMK are not the same airport — leave 4+ hours if connecting.",
              })}
            </p>
          </ScenarioItem>

          <ScenarioItem
            value="urt-ferry"
            highlighted={matchedScenario === "urt-ferry"}
            icon={<Ship className="h-3.5 w-3.5 text-primary" />}
            title={t("arrivalFAQ.s.urtFerry.title", {
              defaultValue: "Scenario: DMK / BKK → URT → ferry → Samui",
            })}
            t={t}
          >
            <p>
              {t("arrivalFAQ.s.urtFerry.body", {
                defaultValue:
                  "The budget route. Fly into Surat Thani (URT), then ferry to Nathon or Lipa Noi pier. Status stays in transit through both URT and the ferry. Final arrival = the pier you land at on Samui.",
              })}
            </p>
          </ScenarioItem>

          <ScenarioItem
            value="usm-direct"
            highlighted={matchedScenario === "usm-direct"}
            icon={<Plane className="h-3.5 w-3.5 text-primary" />}
            title={t("arrivalFAQ.s.usmDirect.title", {
              defaultValue: "Scenario: Direct flight straight to USM",
            })}
            t={t}
          >
            <p>
              {t("arrivalFAQ.s.usmDirect.body", {
                defaultValue:
                  "Easiest path. You land, you're arrived. No transit state. Pickup (if enabled) goes live the moment USM logs your landing.",
              })}
            </p>
          </ScenarioItem>

          <AccordionItem value="what-to-tell" className="border-b-0">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
                {t("arrivalFAQ.q.whatToTell", {
                  defaultValue: "What should I tell staff at each stage?",
                })}
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <ul className="space-y-1.5 pl-1">
                <li><strong className="text-foreground">"I'm at DMK / BKK"</strong> — confirms mainland leg cleared.</li>
                <li><strong className="text-foreground">"I'm at URT"</strong> — heading to ferry next.</li>
                <li><strong className="text-foreground">"I'm on the ferry"</strong> — rough ETA window.</li>
                <li><strong className="text-foreground">"I just reached Nathon / Lipa Noi"</strong> — pickup activates.</li>
                <li><strong className="text-foreground">"Landed at USM"</strong> — pickup activates.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>

      {/* Copy-to-staff script dialog */}
      <Dialog open={!!scriptStage} onOpenChange={(o) => !o && setScriptStage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("arrivalFAQ.script.title", { defaultValue: "Message to send staff" })}
            </DialogTitle>
            <DialogDescription>
              {t("arrivalFAQ.script.desc", {
                defaultValue: "Copy this and send it on any messaging channel you've connected.",
              })}
            </DialogDescription>
          </DialogHeader>
          {scriptStage && (
            <ScriptBlock stage={scriptStage} t={t} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function ScenarioItem({
  value,
  highlighted,
  icon,
  title,
  t,
  children,
}: {
  value: string;
  highlighted: boolean;
  icon: React.ReactNode;
  title: string;
  t: (k: string, o?: any) => string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem
      value={value}
      className={cn(
        "border-b-border",
        highlighted && "bg-primary/5 -mx-4 px-4 rounded",
      )}
    >
      <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
        <span className="flex items-center gap-2 text-left">
          {icon}
          <span>{title}</span>
          {highlighted && (
            <Badge className="text-[9px] h-4 ml-1 bg-primary text-primary-foreground">
              {t("arrivalFAQ.youAreHere", { defaultValue: "You're here" })}
            </Badge>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function NextStepTimeline({
  stage,
  t,
}: {
  stage: Exclude<Stage, null | "arrived">;
  t: (k: string, o?: any) => string;
}) {
  // Generic 4-stop journey
  const stops: Array<{ key: string; label: string; matches: Stage[] }> = [
    {
      key: "depart",
      label: t("arrivalFAQ.timeline.depart", { defaultValue: "Departing" }),
      matches: ["pre_departure"],
    },
    {
      key: "transit",
      label: t("arrivalFAQ.timeline.transit", { defaultValue: "Mainland transit" }),
      matches: ["bkk", "dmk", "urt"],
    },
    {
      key: "crossing",
      label: t("arrivalFAQ.timeline.crossing", { defaultValue: "Ferry / connecting" }),
      matches: ["ferry"],
    },
    {
      key: "samui",
      label: t("arrivalFAQ.timeline.samui", { defaultValue: "On Koh Samui" }),
      matches: ["usm", "pier"],
    },
  ];

  const currentIdx = stops.findIndex((s) => s.matches.includes(stage));
  const stageLabel: Record<Exclude<Stage, null | "arrived">, string> = {
    pre_departure: t("arrivalFAQ.stage.pre_departure", { defaultValue: "Not yet landed" }),
    bkk: t("arrivalFAQ.stage.bkk", { defaultValue: "At BKK (Bangkok)" }),
    dmk: t("arrivalFAQ.stage.dmk", { defaultValue: "At DMK (Don Mueang)" }),
    urt: t("arrivalFAQ.stage.urt", { defaultValue: "At URT (Surat Thani)" }),
    ferry: t("arrivalFAQ.stage.ferry", { defaultValue: "On the ferry" }),
    pier: t("arrivalFAQ.stage.pier", { defaultValue: "At Samui pier" }),
    usm: t("arrivalFAQ.stage.usm", { defaultValue: "Landed at USM" }),
  };

  const nextHint: Record<Exclude<Stage, null | "arrived">, string> = {
    pre_departure: t("arrivalFAQ.next.pre_departure", {
      defaultValue: "Confirm you've landed once you reach Thailand.",
    }),
    bkk: t("arrivalFAQ.next.bkk", {
      defaultValue: "Catch your connecting flight to USM, or onward to URT for the ferry.",
    }),
    dmk: t("arrivalFAQ.next.dmk", {
      defaultValue: "Catch your connecting flight (USM or URT). Allow 4+ hrs if transferring to BKK.",
    }),
    urt: t("arrivalFAQ.next.urt", {
      defaultValue: "Take the shuttle to Donsak pier, then ferry to Nathon or Lipa Noi.",
    }),
    ferry: t("arrivalFAQ.next.ferry", {
      defaultValue: "Tell us when you're a few minutes from the pier.",
    }),
    pier: t("arrivalFAQ.next.pier", { defaultValue: "Pickup activates — your driver is on the way." }),
    usm: t("arrivalFAQ.next.usm", { defaultValue: "Pickup activates — your driver is on the way." }),
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Badge className="text-[10px] bg-primary text-primary-foreground">
          {stageLabel[stage]}
        </Badge>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          {t("arrivalFAQ.nextStep", { defaultValue: "Next step" })}
        </span>
      </div>

      <p className="text-xs text-foreground leading-relaxed">{nextHint[stage]}</p>

      <div className="flex items-center gap-1 pt-1 overflow-x-auto">
        {stops.map((stop, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          return (
            <div key={stop.key} className="flex items-center gap-1 shrink-0">
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-[10px]",
                  done && "text-muted-foreground",
                  current && "bg-primary text-primary-foreground font-medium",
                  !done && !current && "text-muted-foreground",
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Circle className={cn("h-3 w-3", current && "fill-current")} />
                )}
                <span>{stop.label}</span>
              </div>
              {i < stops.length - 1 && (
                <span className="text-muted-foreground/40 text-[10px]">→</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getScript(stage: Exclude<Stage, null | "arrived" | "pre_departure">, t: (k: string, o?: any) => string): string {
  const map: Record<typeof stage, string> = {
    bkk: t("arrivalFAQ.scriptText.bkk", {
      defaultValue:
        "Hi — I just landed at BKK (Bangkok Suvarnabhumi). Heading to my connecting flight now. I'll message again when I'm closer to Samui.",
    }),
    dmk: t("arrivalFAQ.scriptText.dmk", {
      defaultValue:
        "Hi — I just landed at DMK (Don Mueang). Catching my next flight soon. Will update once I'm in Samui.",
    }),
    urt: t("arrivalFAQ.scriptText.urt", {
      defaultValue:
        "Hi — I've landed at Surat Thani (URT). Heading to the ferry to Samui. I'll let you know when I'm on the boat.",
    }),
    ferry: t("arrivalFAQ.scriptText.ferry", {
      defaultValue:
        "Hi — I'm on the ferry to Samui now. Will message again when I'm a few minutes from the pier.",
    }),
    pier: t("arrivalFAQ.scriptText.pier", {
      defaultValue:
        "Hi — just reached the pier on Samui (Nathon / Lipa Noi). Ready for pickup.",
    }),
    usm: t("arrivalFAQ.scriptText.usm", {
      defaultValue: "Hi — landed at USM (Koh Samui Airport). Ready for pickup.",
    }),
  };
  return map[stage];
}

function ScriptBlock({ stage, t }: { stage: Stage; t: (k: string, o?: any) => string }) {
  if (!stage || stage === "pre_departure" || stage === "arrived") return null;
  const text = getScript(stage as any, t);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("common.copied", { defaultValue: "Copied!" }));
    } catch {
      toast.error(t("common.error", { defaultValue: "Couldn't copy" }));
    }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/40 p-3 text-sm text-foreground whitespace-pre-wrap">
        {text}
      </div>
      <Button onClick={onCopy} className="w-full" size="sm">
        <Copy className="h-3.5 w-3.5 mr-2" />
        {t("common.copy", { defaultValue: "Copy" })}
      </Button>
    </div>
  );
}

// ───────────────────────── Print sheet ─────────────────────────

function printArrivalSheet(
  bookingId: string,
  lang: string,
  t: (k: string, o?: any) => string,
  pickup: any,
) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) {
    toast.error(t("arrivalFAQ.printBlocked", {
      defaultValue: "Pop-up blocked — please allow pop-ups to print.",
    }));
    return;
  }
  const flight = pickup?.flight_number ?? "—";
  const intl = pickup?.international_flight_number ?? "—";
  const arrivalAt = pickup?.arrival_datetime
    ? new Date(pickup.arrival_datetime).toLocaleString(lang)
    : "—";

  const title = t("arrivalFAQ.printTitle", { defaultValue: "Arrival Instructions — Koh Samui" });
  win.document.write(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.45; }
    h1 { font-size: 18pt; margin: 0 0 4pt; }
    h2 { font-size: 13pt; margin: 14pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
    .lead { color: #444; margin: 0 0 12pt; }
    .meta { background: #f4f4f4; padding: 8pt 10pt; border-radius: 4pt; font-size: 10pt; margin: 8pt 0 14pt; }
    .meta div { margin: 2pt 0; }
    .rule { background: #fff8e1; border-left: 3pt solid #f59e0b; padding: 8pt 10pt; margin: 8pt 0; }
    table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
    th, td { border: 1px solid #ccc; padding: 5pt 7pt; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 600; }
    ul { margin: 4pt 0; padding-left: 18pt; }
    li { margin: 2pt 0; }
    .footer { margin-top: 16pt; font-size: 9pt; color: #666; text-align: center; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="lead">${t("arrivalFAQ.lead", { defaultValue: "Only USM (Koh Samui Airport) and the island piers count as final arrival. Everything else is still transit." })}</p>

  <div class="meta">
    <div><strong>${t("arrivalFAQ.print.bookingId", { defaultValue: "Booking" })}:</strong> ${bookingId}</div>
    <div><strong>${t("arrivalFAQ.print.intlFlight", { defaultValue: "International flight" })}:</strong> ${intl}</div>
    <div><strong>${t("arrivalFAQ.print.finalFlight", { defaultValue: "Final/connecting flight" })}:</strong> ${flight}</div>
    <div><strong>${t("arrivalFAQ.print.arrivalTime", { defaultValue: "Arrival time" })}:</strong> ${arrivalAt}</div>
  </div>

  <div class="rule">
    <strong>${t("arrivalFAQ.print.ruleTitle", { defaultValue: "Transit vs. Arrival rule" })}:</strong>
    ${t("arrivalFAQ.print.ruleBody", {
      defaultValue:
        "BKK, DMK and URT are mainland transit checkpoints — staff sees you in transit until you reach Koh Samui. USM (Samui Airport) and the Nathon / Lipa Noi piers count as final arrival. Pickup activates only at final arrival.",
    })}
  </div>

  <h2>${t("arrivalFAQ.print.checkpoints", { defaultValue: "Checkpoints" })}</h2>
  <table>
    <thead><tr><th>${t("arrivalFAQ.print.code", { defaultValue: "Code" })}</th><th>${t("arrivalFAQ.print.name", { defaultValue: "Place" })}</th><th>${t("arrivalFAQ.print.status", { defaultValue: "Status" })}</th></tr></thead>
    <tbody>
      <tr><td>BKK</td><td>Bangkok Suvarnabhumi</td><td>${t("arrivalFAQ.print.transit", { defaultValue: "Transit" })}</td></tr>
      <tr><td>DMK</td><td>Don Mueang (Bangkok budget)</td><td>${t("arrivalFAQ.print.transit", { defaultValue: "Transit" })}</td></tr>
      <tr><td>URT</td><td>Surat Thani (mainland — ferry)</td><td>${t("arrivalFAQ.print.transit", { defaultValue: "Transit" })}</td></tr>
      <tr><td>USM</td><td>Koh Samui Airport</td><td><strong>${t("arrivalFAQ.print.arrived", { defaultValue: "Arrived" })}</strong></td></tr>
      <tr><td>Pier</td><td>Nathon / Lipa Noi</td><td><strong>${t("arrivalFAQ.print.arrived", { defaultValue: "Arrived" })}</strong></td></tr>
    </tbody>
  </table>

  <h2>${t("arrivalFAQ.print.cheatTitle", { defaultValue: "What to message staff at each stage" })}</h2>
  <ul>
    <li><strong>"${t("arrivalFAQ.scriptText.bkk", { defaultValue: "I just landed at BKK." })}"</strong></li>
    <li><strong>"${t("arrivalFAQ.scriptText.dmk", { defaultValue: "I just landed at DMK." })}"</strong></li>
    <li><strong>"${t("arrivalFAQ.scriptText.urt", { defaultValue: "I've landed at Surat Thani (URT)." })}"</strong></li>
    <li><strong>"${t("arrivalFAQ.scriptText.ferry", { defaultValue: "I'm on the ferry to Samui." })}"</strong></li>
    <li><strong>"${t("arrivalFAQ.scriptText.pier", { defaultValue: "Just reached the pier." })}"</strong></li>
    <li><strong>"${t("arrivalFAQ.scriptText.usm", { defaultValue: "Landed at USM." })}"</strong></li>
  </ul>

  <div class="footer">${t("arrivalFAQ.print.footer", { defaultValue: "Print this sheet or save as PDF — keep it on your phone for the trip." })}</div>

  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`);
  win.document.close();
}
