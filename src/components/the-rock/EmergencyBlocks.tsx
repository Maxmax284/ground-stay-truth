import { Phone } from "lucide-react";
import {
  NATIONAL_CONTACTS, SAMUI_HOSPITALS, SOURCES_CHECKED_LABEL, JELLYFISH_SOURCE, type ContactRecord,
} from "@/content/theRockEmergency";

function CallLink({ display, tel, note, big }: { display: string; tel: string; note?: string; big?: boolean }) {
  return (
    <a
      href={`tel:${tel}`}
      data-preview-allow
      className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 font-stat tracking-wide no-underline ${
        big ? "border-destructive/40 bg-destructive/10 text-destructive text-lg" : "border-border bg-card text-foreground text-sm"
      }`}
    >
      <Phone className="h-4 w-4" aria-hidden />
      {display}
      {note && <span className="text-xs text-muted-foreground font-sans">{note}</span>}
    </a>
  );
}

const SourcesLabel = () => (
  <p className="text-xs text-muted-foreground">
    Sources checked: {SOURCES_CHECKED_LABEL} · from published official sources
  </p>
);

function Row({ c }: { c: ContactRecord }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border last:border-0">
      <span className="text-sm text-foreground">
        {c.label}
        {c.area && <span className="block text-xs text-muted-foreground">{c.area}</span>}
      </span>
      <span className="flex flex-wrap gap-2">
        {c.numbers.map((x) => <CallLink key={x.tel} {...x} big={c.priority} />)}
      </span>
    </li>
  );
}

export function EmergencyContacts() {
  const visible = NATIONAL_CONTACTS.filter((c) => c.guestVisible);
  const top = visible.filter((c) => c.priority);
  const rest = visible.filter((c) => !c.priority);
  return (
    <section id="emergency" aria-labelledby="emergency-h" className="not-prose scroll-mt-20 space-y-3 rounded-lg border border-destructive/30 bg-card p-4">
      <h2 id="emergency-h" className="text-base font-semibold tracking-wide text-foreground">EMERGENCY CONTACTS · THAILAND</h2>
      <ul className="grid gap-2 sm:grid-cols-3">
        {top.map((c) => (
          <li key={c.label} className="space-y-1">
            <span className="block text-xs text-muted-foreground">{c.label}</span>
            {c.numbers.map((x) => <CallLink key={x.tel} {...x} big />)}
          </li>
        ))}
      </ul>
      <ul>{rest.map((c) => <Row key={c.label} c={c} />)}</ul>
      <SourcesLabel />
    </section>
  );
}

export function MedicalFacilities() {
  return (
    <section aria-labelledby="medical-h" className="not-prose space-y-2 rounded-lg border border-border bg-card p-4">
      <h2 id="medical-h" className="text-base font-semibold tracking-wide text-foreground">KOH SAMUI MEDICAL FACILITIES</h2>
      <p className="text-xs text-muted-foreground">For a medical emergency, call 1669 first.</p>
      <ul>{SAMUI_HOSPITALS.filter((c) => c.guestVisible).map((c) => <Row key={c.label} c={c} />)}</ul>
      <SourcesLabel />
    </section>
  );
}

export function JellyfishFirstAid() {
  return (
    <section aria-labelledby="jelly-h" className="not-prose space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
      <h4 id="jelly-h" className="font-semibold tracking-wide">SUSPECTED BOX JELLYFISH STING</h4>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Get the person out of the water safely.</li>
        <li>Call <a href="tel:1669" data-preview-allow className="font-semibold underline">1669</a>.</li>
        <li>Pour household vinegar over the affected area for at least 30 seconds.</li>
        <li>Do not rub the area or rinse it with fresh water.</li>
        <li>Follow the emergency dispatcher's instructions. If the person is unresponsive and not breathing normally, begin CPR.</li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Source: <a href={JELLYFISH_SOURCE} target="_blank" rel="noreferrer" className="underline" data-preview-allow>Department of Marine and Coastal Resources</a> · Sources checked: {SOURCES_CHECKED_LABEL}
      </p>
    </section>
  );
}
