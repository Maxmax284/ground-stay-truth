import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, Search, Siren, X } from "lucide-react";
import { EmergencyContacts, MedicalFacilities, JellyfishFirstAid } from "./EmergencyBlocks";
// Locked source edition — never edited in code. Guest edition is derived at render time.
import manuscript from "../../../content/the-rock/master-manuscript.v1.md?raw";
import img01 from "@/assets/rock/dept-01.jpg";
import img02 from "@/assets/rock/dept-02.jpg";
import img03 from "@/assets/rock/dept-03.jpg";
import img04 from "@/assets/rock/dept-04.jpg";
import img05 from "@/assets/rock/dept-05.jpg";
import img06 from "@/assets/rock/dept-06.jpg";

const APPENDIX_MARKER = "# EDITORIAL & IMPLEMENTATION APPENDIX";
const HEROES: Record<string, string> = { "01": img01, "02": img02, "03": img03, "04": img04, "05": img05, "06": img06 };
const SHORT: Record<string, string> = {
  "01": "Know the Rock", "02": "How it works", "03": "Culture", "04": "Street survival", "05": "Good stuff", "06": "Camp code",
};

/** Strips staff-only editorial markers so guests only see the guide itself. */
function toGuestEdition(src: string) {
  const idx = src.indexOf(APPENDIX_MARKER);
  let g = idx >= 0 ? src.slice(0, idx) : src;
  g = g
    .split("\n")
    .filter((l) => !/^\*\*Editorial status:\*\*/.test(l) && !/^\*Publication hold:/.test(l))
    .join("\n")
    .replace(/\s*·\s*[A-Z ]+(REVIEW|VERIFICATION) REQUIRED/g, "")
    .replace(/\*\*\[NEW DRAFT\]\s*·\s*/g, "**")
    .replace(/\*\*\[NEW DRAFT\]\s*/g, "**")
    .replace(/\s*\[NEW DRAFT\]/g, "")
    .replace(/^\*\*\*\*\s*$/gm, "");
  return g;
}

type Report = { id: string; code: string; title: string; body: string };
type Dept = { num: string; title: string; subtitle: string; intro: string; reports: Report[] };

function parse(guide: string) {
  const parts = guide.split(/^# /m);
  let prologue = "";
  let epilogue = "";
  const depts: Dept[] = [];
  parts.forEach((p, i) => {
    if (!p.trim()) return;
    const m = p.match(/^(0\d) \/\/ (.+)\n/);
    if (!m) {
      if (depts.length) epilogue += "# " + p;
      else prologue += (i === 0 ? "" : "# ") + p;
      return;
    }
    const rest = p.slice(m[0].length);
    const sub = rest.match(/^\s*## (.+)\n/);
    const afterSub = sub ? rest.slice(rest.indexOf(sub[0]) + sub[0].length) : rest;
    const chunks = afterSub.split(/^### /m);
    const reports = chunks.slice(1).map((c, j) => {
      const nl = c.indexOf("\n");
      const head = c.slice(0, nl).trim();
      const hm = head.match(/^(?:FIELD REPORT\s+)?([^/]+?)\s*\/\/\s*(.+)$/);
      return {
        id: `r-${m[1]}-${j}`,
        code: hm ? hm[1].trim() : "",
        title: hm ? hm[2].trim() : head,
        body: c.slice(nl + 1).trim(),
      };
    });
    depts.push({ num: m[1], title: m[2].trim(), subtitle: sub?.[1].trim() ?? "", intro: chunks[0].trim(), reports });
  });
  return { prologue: prologue.replace(/^THE ROCK\.[\s\S]*?\n(?=# )/, ""), epilogue, depts };
}

const plain = (s: string) => s.replace(/[*_>#`[\]]/g, "").replace(/\s+/g, " ").trim();

export function TheRockReader() {
  const { prologue, epilogue, depts } = useMemo(() => parse(toGuestEdition(manuscript)), []);
  const [active, setActive] = useState("01");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  const dept = depts.find((d) => d.num === active) ?? depts[0];
  const q = query.trim().toLowerCase();
  const hits = useMemo(
    () => (q.length < 2 ? [] : depts.flatMap((d) => d.reports.filter((r) => (r.title + " " + r.body).toLowerCase().includes(q)).map((r) => ({ d, r })))),
    [q, depts],
  );

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const goTo = (num: string, reportId?: string) => {
    setActive(num);
    setQuery("");
    if (reportId) setOpen((s) => new Set(s).add(reportId));
    requestAnimationFrame(() => {
      const el = reportId ? document.getElementById(reportId) : topRef.current;
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openEmergency = () => {
    const d4 = depts.find((d) => d.num === "04");
    const r = d4?.reports.find((x) => x.code === "004-08");
    if (d4 && r) goTo("04", r.id);
  };

  return (
    <div className="space-y-4">
      {/* HUD */}
      <div ref={topRef} className="sticky top-0 z-20 -mx-4 scroll-mt-0 border-b border-border bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: scooter, jellyfish, temple…"
              aria-label="Search the guide"
              data-preview-allow
              className="h-10 w-full rounded-md border border-input bg-card pl-8 pr-8 text-sm outline-none focus:border-primary"
            />
            {query && (
              <button type="button" data-preview-allow onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            data-preview-allow
            onClick={openEmergency}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs font-semibold text-destructive"
          >
            <Siren className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Emergency</span> 1669
          </button>
        </div>

        <div role="tablist" aria-label="Departments" className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {depts.map((d) => (
            <button
              key={d.num}
              role="tab"
              aria-selected={d.num === active}
              data-preview-allow
              onClick={() => goTo(d.num)}
              className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors duration-300 ${
                d.num === active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/60"
              }`}
            >
              <span className="font-stat">{d.num}</span> {SHORT[d.num] ?? d.title}
            </button>
          ))}
        </div>
      </div>

      {q.length >= 2 ? (
        <section aria-live="polite" className="rock-fade space-y-2">
          <p className="text-xs text-muted-foreground">{hits.length} result{hits.length === 1 ? "" : "s"} for “{query}”</p>
          {hits.map(({ d, r }) => (
            <button key={r.id} type="button" data-preview-allow onClick={() => goTo(d.num, r.id)} className="rock-card block w-full rounded-md border border-border bg-card p-3 text-left">
              <span className="font-stat text-xs text-primary">{r.code || d.num}</span>
              <span className="ml-2 text-sm font-medium">{r.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{SHORT[d.num]}</span>
            </button>
          ))}
        </section>
      ) : (
        <>
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Unofficial field guide.</strong> Practical advice from the camp, not legal or
            medical authority. Rules, prices and conditions change, so confirm locally. In an emergency, contact local emergency
            services first.
          </div>

          {active === "01" && prologue.trim() && (
            <Collapsible label="Welcome to the Rock — read this first" id="prologue" open={open} toggle={toggle}>
              <Md>{prologue}</Md>
            </Collapsible>
          )}

          <section key={dept.num} className="rock-fade space-y-3">
            <figure className="relative overflow-hidden rounded-lg border border-border">
              <img src={HEROES[dept.num]} alt="" width={1280} height={640} className="aspect-[2/1] w-full object-cover sm:aspect-[3/1]" />
              <figcaption className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-foreground/85 via-foreground/30 to-transparent p-4">
                <span className="font-stat text-xs tracking-widest text-background/80">DEPARTMENT {dept.num}</span>
                <span className="text-xl font-bold tracking-wide text-background sm:text-2xl">{dept.title}</span>
                {dept.subtitle && <span className="text-xs text-background/80">{dept.subtitle}</span>}
              </figcaption>
            </figure>

            {dept.intro && <div className="text-sm text-muted-foreground"><Md>{dept.intro}</Md></div>}

            <p className="font-stat text-[11px] tracking-widest text-muted-foreground">{dept.reports.length} FIELD REPORTS · TAP TO OPEN</p>

            <ul className="space-y-2">
              {dept.reports.map((r, i) => {
                const isOpen = open.has(r.id);
                return (
                  <li key={r.id} id={r.id} className="rock-card scroll-mt-28 rounded-md border border-border bg-card" style={{ animationDelay: `${i * 40}ms` }}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      data-preview-allow
                      onClick={() => toggle(r.id)}
                      className="flex w-full items-start gap-3 p-3 text-left"
                    >
                      <span className="mt-0.5 font-stat text-xs text-primary">{r.code || "—"}</span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold leading-snug">{r.title}</span>
                        {!isOpen && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{plain(r.body).slice(0, 180)}</span>}
                      </span>
                      <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                      <div className="overflow-hidden">
                        <div className="border-t border-border px-3 pb-4 pt-3">
                          <Md>{r.body}</Md>
                          {r.code === "004-03" && <div className="mt-4"><JellyfishFirstAid /></div>}
                          {r.code === "004-08" && <div className="mt-4 space-y-4"><EmergencyContacts /><MedicalFacilities /></div>}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-between gap-2 pt-2">
              {(() => {
                const i = depts.findIndex((d) => d.num === dept.num);
                const prev = depts[i - 1];
                const next = depts[i + 1];
                return (
                  <>
                    {prev ? <NavBtn onClick={() => goTo(prev.num)}>← {prev.num} {SHORT[prev.num]}</NavBtn> : <span />}
                    {next ? <NavBtn onClick={() => goTo(next.num)}>{next.num} {SHORT[next.num]} →</NavBtn> : <span />}
                  </>
                );
              })()}
            </div>
          </section>

          {active === "06" && epilogue.trim() && (
            <div className="rounded-lg border border-primary/30 bg-card p-4"><Md>{epilogue}</Md></div>
          )}
        </>
      )}
    </div>
  );
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" data-preview-allow onClick={onClick} className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:border-primary">
      {children}
    </button>
  );
}

function Collapsible({ label, id, open, toggle, children }: { label: string; id: string; open: Set<string>; toggle: (id: string) => void; children: React.ReactNode }) {
  const isOpen = open.has(id);
  return (
    <div className="rounded-md border border-border bg-card">
      <button type="button" aria-expanded={isOpen} data-preview-allow onClick={() => toggle(id)} className="flex w-full items-center justify-between p-3 text-left text-sm font-medium">
        {label}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden"><div className="border-t border-border px-3 pb-4 pt-3">{children}</div></div>
      </div>
    </div>
  );
}

function Md({ children }: { children: string }) {
  if (!children) return null;
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-blockquote:border-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-hr:border-border">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
