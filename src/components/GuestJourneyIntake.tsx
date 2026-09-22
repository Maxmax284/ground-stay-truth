import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, Ship, Car, Bus, Upload, Loader2, Plus, Trash2, Check, Info } from "lucide-react";
import { useJourneyLegs } from "@/hooks/useArrivalIntelligence";
import { useArrivalConflicts } from "@/hooks/useArrivalIntelligence";
import { useSaveJourneyLegs, useUploadTravelEvidence } from "@/hooks/useJourneyIntake";
import { describeLegCarrier, needsOnwardTravel, onwardPrompt, readIntakeStatus, type DraftLeg } from "@/lib/journeyIntake";
import type { LegType } from "@/lib/arrivalIntelligence";

interface Props {
  bookingId: string;
}

const TYPE_ICON: Record<string, typeof Plane> = {
  flight: Plane,
  ferry: Ship,
  bus: Bus,
  road: Car,
  other: Car,
};

function emptyLeg(order: number, type: LegType = "flight"): DraftLeg {
  return {
    leg_order: order,
    leg_type: type,
    marketed_flight_number: "",
    from_code: "",
    to_code: "",
    scheduled_departure: "",
    scheduled_arrival: "",
  };
}

/** Local datetime value for the input, from an ISO string. */
function toLocalInput(value?: string | null): string {
  if (!value) return "";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Guest travel intake. One question at the top, one obvious move.
 *
 * Nothing here changes a booking, pickup, price or room. It records how the
 * guest is travelling — and asks for the hop to the island when the journey
 * stops on the mainland.
 */
export function GuestJourneyIntake({ bookingId }: Props) {
  const { t } = useTranslation();
  const { data: legs = [], isLoading } = useJourneyLegs(bookingId);
  const { data: conflicts = [] } = useArrivalConflicts(bookingId);
  const save = useSaveJourneyLegs();
  const upload = useUploadTravelEvidence();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftLeg[]>([]);

  const status = useMemo(
    () => readIntakeStatus({ legs: legs as any[], openConflicts: conflicts.length }),
    [legs, conflicts.length],
  );

  const startEditing = (addOnward = false) => {
    const base: DraftLeg[] = legs.length
      ? legs.map((l) => ({
          leg_order: l.leg_order,
          leg_type: (l.leg_type as LegType) ?? "flight",
          marketed_flight_number: l.marketed_flight_number ?? "",
          from_code: l.from_code ?? "",
          to_code: l.to_code ?? "",
          scheduled_departure: toLocalInput(l.scheduled_departure),
          scheduled_arrival: toLocalInput(l.scheduled_arrival),
        }))
      : [emptyLeg(1)];
    if (addOnward) base.push(emptyLeg(base.length + 1, "ferry"));
    setDrafts(base);
    setEditing(true);
  };

  const setField = (index: number, field: keyof DraftLeg, value: string) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  };

  const addLeg = () => setDrafts((prev) => [...prev, emptyLeg(prev.length + 1)]);
  const removeLeg = (index: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, leg_order: i + 1 })));

  const submit = async () => {
    const cleaned = drafts
      .map((d, i) => ({
        ...d,
        leg_order: i + 1,
        marketed_flight_number: (d.marketed_flight_number || "").trim() || null,
        from_code: (d.from_code || "").trim() || null,
        to_code: (d.to_code || "").trim() || null,
        scheduled_departure: d.scheduled_departure ? new Date(d.scheduled_departure).toISOString() : null,
        scheduled_arrival: d.scheduled_arrival ? new Date(d.scheduled_arrival).toISOString() : null,
      }))
      .filter((d) => d.marketed_flight_number || (d.from_code && d.to_code));

    if (!cleaned.length) {
      toast.error(t("journeyIntake.needSomething", "Add a flight number, or where you're coming from and going to."));
      return;
    }

    try {
      const result = await save.mutateAsync({ bookingId, legs: cleaned });
      setEditing(false);
      if (result.needs_onward) {
        toast.warning(t("journeyIntake.savedNeedsOnward", "Saved. We still need how you reach Koh Samui."));
      } else {
        toast.success(t("journeyIntake.saved", "Saved — we'll watch your travel from here."));
      }
    } catch (error: any) {
      toast.error(error?.message ?? t("journeyIntake.saveFailed", "Couldn't save that. Try again."));
    }
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const result = await upload.mutateAsync({ bookingId, file });
      if (!result.readable) {
        toast.warning(t("journeyIntake.unreadable", "We couldn't read that one — type your flight instead."));
        startEditing();
        return;
      }
      const parts: string[] = [];
      if (result.legs_created) parts.push(t("journeyIntake.legsAdded", "{{count}} leg added", { count: result.legs_created }));
      if (result.enriched) parts.push(t("journeyIntake.gapsFilled", "gaps filled"));
      if (result.conflicts) parts.push(t("journeyIntake.toCheck", "{{count}} to check with you", { count: result.conflicts }));
      toast.success(parts.length ? parts.join(" · ") : t("journeyIntake.readNothingNew", "Read it — nothing new to add."));
    } catch (error: any) {
      toast.error(error?.message ?? t("journeyIntake.uploadFailed", "Upload failed. Try a screenshot."));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isLoading) return null;

  const busy = save.isPending || upload.isPending;
  const needsOnward = needsOnwardTravel(legs as any[]);
  const lastLeg = [...legs].sort((a, b) => a.leg_order - b.leg_order)[legs.length - 1];

  return (
    <Card className={status.complete ? "border-primary/20" : "border-amber-500/40 bg-amber-500/5"}>
      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Two-second read: what we know, what we need. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              {t(`journeyIntake.status.${status.complete ? "ready" : "needed"}`, status.headline)}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">{status.detail}</p>
          </div>
          {status.complete ? (
            <Badge variant="outline" className="shrink-0 gap-1">
              <Check className="h-3 w-3" /> {t("journeyIntake.onFile", "On file")}
            </Badge>
          ) : null}
        </div>

        {/* What we have, in plain language. */}
        {legs.length > 0 && !editing && (
          <ul className="space-y-2">
            {[...legs]
              .sort((a, b) => a.leg_order - b.leg_order)
              .map((leg) => {
                const Icon = TYPE_ICON[leg.leg_type] ?? Plane;
                return (
                  <li key={leg.id} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {leg.from_code || "?"} → {leg.to_code || "?"}
                        {leg.is_final_leg ? (
                          <span className="ml-2 text-xs text-primary">{t("journeyIntake.weMeetYou", "we meet you here")}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {leg.leg_type === "flight" ? describeLegCarrier(leg as any) : t(`journeyIntake.type.${leg.leg_type}`, leg.leg_type)}
                      </p>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}

        {/* The missing hop — asked, never guessed. */}
        {needsOnward && !editing && (
          <div className="flex items-start gap-2 rounded-md bg-background/60 border border-amber-500/40 px-3 py-2">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm">{onwardPrompt(lastLeg?.to_name, lastLeg?.to_code)}</p>
          </div>
        )}

        {/* Editor */}
        {editing && (
          <div className="space-y-4">
            {drafts.map((draft, index) => (
              <div key={index} className="rounded-md border border-border/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("journeyIntake.legLabel", "Leg {{n}}", { n: index + 1 })}
                  </span>
                  {drafts.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeLeg(index)} className="h-7 px-2">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs">{t("journeyIntake.howLabel", "How")}</Label>
                    <Select value={draft.leg_type} onValueChange={(v) => setField(index, "leg_type", v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flight">{t("journeyIntake.type.flight", "Flight")}</SelectItem>
                        <SelectItem value="ferry">{t("journeyIntake.type.ferry", "Ferry / boat")}</SelectItem>
                        <SelectItem value="bus">{t("journeyIntake.type.bus", "Bus / van")}</SelectItem>
                        <SelectItem value="road">{t("journeyIntake.type.road", "Car / taxi")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {draft.leg_type === "flight" && (
                    <div className="col-span-2 sm:col-span-1">
                      <Label className="text-xs">{t("journeyIntake.flightNumber", "Flight number")}</Label>
                      <Input
                        className="h-9"
                        placeholder="TG6285"
                        value={draft.marketed_flight_number ?? ""}
                        onChange={(e) => setField(index, "marketed_flight_number", e.target.value.toUpperCase())}
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">{t("journeyIntake.from", "From")}</Label>
                    <Input
                      className="h-9"
                      placeholder="BKK"
                      value={draft.from_code ?? ""}
                      onChange={(e) => setField(index, "from_code", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("journeyIntake.to", "To")}</Label>
                    <Input
                      className="h-9"
                      placeholder="USM"
                      value={draft.to_code ?? ""}
                      onChange={(e) => setField(index, "to_code", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("journeyIntake.departs", "Departs")}</Label>
                    <Input
                      className="h-9"
                      type="datetime-local"
                      value={draft.scheduled_departure ?? ""}
                      onChange={(e) => setField(index, "scheduled_departure", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("journeyIntake.arrives", "Arrives")}</Label>
                    <Input
                      className="h-9"
                      type="datetime-local"
                      value={draft.scheduled_arrival ?? ""}
                      onChange={(e) => setField(index, "scheduled_arrival", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addLeg} className="w-full h-9">
              <Plus className="h-4 w-4 mr-1" /> {t("journeyIntake.addLeg", "Add another leg")}
            </Button>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={busy} className="flex-1 h-10">
                {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {t("journeyIntake.saveTravel", "Save my travel")}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy} className="h-10">
                {t("common.cancel", "Cancel")}
              </Button>
            </div>
          </div>
        )}

        {/* Two ways in. Both obvious. */}
        {!editing && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => startEditing(needsOnward)} className="flex-1 h-10" disabled={busy}>
              {legs.length
                ? needsOnward
                  ? t("journeyIntake.addOnward", "Add my hop to Samui")
                  : t("journeyIntake.editTravel", "Update my travel")
                : t("journeyIntake.addTravel", "Add my travel")}
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-10"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {t("journeyIntake.uploadBooking", "Upload my booking")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          {t(
            "journeyIntake.privacy",
            "We only read travel details from what you upload. Your booking reference is stored hidden, and we never track your location.",
          )}{" "}
          {t(
            "journeyIntake.retention",
            "Anything you upload is deleted 30 days after you check out.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}
