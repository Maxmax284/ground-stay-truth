import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Plane, Ship, MapPin, AlertCircle } from "lucide-react";

/**
 * Guest-facing FAQ explaining the transit-vs-arrival distinction.
 * BKK / DMK / URT are mainland transit checkpoints.
 * USM (Koh Samui Airport) and the island piers are the only true "arrived" points.
 *
 * Lives alongside the arrival cards in the Guest Portal so the rule is visible
 * before guests start asking staff.
 */
export function ArrivalRouteFAQ() {
  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            Getting to Koh Samui — Quick FAQ
          </span>
          <Badge variant="secondary" className="text-[10px] ml-auto">
            Transit vs. Arrival
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Only <strong className="text-foreground">USM (Koh Samui Airport)</strong>{" "}
          and the island piers count as your final arrival. Everything else is
          still in transit — even if you've already landed in Thailand.
        </p>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="why" className="border-b-border">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Why doesn't BKK / DMK / URT count as "arrived"?
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                Those airports are on the Thai mainland. You still need a
                connecting flight or a ferry to reach the island. Until your
                feet hit Samui, the team treats you as{" "}
                <strong className="text-foreground">in transit</strong> — pickup
                isn't dispatched yet, but staff can see your route.
              </p>
              <ul className="space-y-1 pl-1">
                <li>
                  <strong className="text-foreground">BKK</strong> — Bangkok
                  Suvarnabhumi (international hub, connect to USM or URT)
                </li>
                <li>
                  <strong className="text-foreground">DMK</strong> — Don Mueang
                  (Bangkok's budget airport, common for AirAsia / Nok / Lion)
                </li>
                <li>
                  <strong className="text-foreground">URT</strong> — Surat Thani
                  (mainland — ferry to Samui from here)
                </li>
                <li>
                  <strong className="text-foreground">USM ✓</strong> — Koh Samui
                  Airport (this is "arrived")
                </li>
                <li>
                  <strong className="text-foreground">Nathon / Lipa Noi ✓</strong>{" "}
                  — Samui ferry piers (this is "arrived")
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="bkk-usm" className="border-b-border">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <Plane className="h-3.5 w-3.5 text-primary" />
                Scenario: BKK → USM (direct connection)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                You land at BKK, clear immigration, then catch your domestic leg
                to Samui (USM). The system will show you as{" "}
                <em>"in transit — Bangkok"</em> until USM lands. Once USM lands,
                your status flips to arrived and pickup goes live.
              </p>
              <p className="text-foreground">
                Tell us both flight numbers if you can — it lets staff see the
                full route.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="dmk-usm" className="border-b-border">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <Plane className="h-3.5 w-3.5 text-primary" />
                Scenario: DMK → USM (budget Bangkok route)
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                Don Mueang is Bangkok's second airport — usually cheaper, mostly
                budget carriers. Same rule: landing at DMK keeps you{" "}
                <em>in transit</em>. Final arrival is USM.
              </p>
              <p className="text-foreground">
                Heads up: BKK and DMK are{" "}
                <strong>not the same airport</strong>. If you're connecting
                between them, leave 4+ hours — taxi or shuttle bus only.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="urt-ferry" className="border-b-border">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <Ship className="h-3.5 w-3.5 text-primary" />
                Scenario: DMK / BKK → URT → ferry → Samui
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                The budget route. Fly into Surat Thani (URT), then ferry across
                to Nathon or Lipa Noi pier. Often cheaper than flying direct to
                USM — and faster than the overnight bus.
              </p>
              <p>
                Status stays <em>in transit</em> through both URT and the ferry.
                Tell us when you're on the boat or when you reach the pier — we
                use that to time pickup.
              </p>
              <p className="text-foreground">
                Final arrival = the pier you land at on Samui.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="usm-direct" className="border-b-border">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <Plane className="h-3.5 w-3.5 text-primary" />
                Scenario: Direct flight straight to USM
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                Easiest path. You land, you're arrived. No transit state. Pickup
                (if enabled) goes live the moment USM logs your landing.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="what-to-tell" className="border-b-0">
            <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
                What should I tell staff at each stage?
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <ul className="space-y-1.5 pl-1">
                <li>
                  <strong className="text-foreground">"I'm at DMK / BKK"</strong>{" "}
                  — confirms you've cleared the mainland leg.
                </li>
                <li>
                  <strong className="text-foreground">"I'm at URT"</strong> —
                  staff knows you're heading to the ferry next.
                </li>
                <li>
                  <strong className="text-foreground">"I'm on the ferry"</strong>{" "}
                  — gives a rough ETA window for pickup.
                </li>
                <li>
                  <strong className="text-foreground">
                    "I just reached Nathon / Lipa Noi"
                  </strong>{" "}
                  — final arrival, pickup activates.
                </li>
                <li>
                  <strong className="text-foreground">"Landed at USM"</strong> —
                  same thing, pickup activates.
                </li>
              </ul>
              <p className="pt-1">
                You can message us on any channel you've connected — the team
                sees it all in one place.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
