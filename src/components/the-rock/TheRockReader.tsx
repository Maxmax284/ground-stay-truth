import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmergencyContacts, MedicalFacilities, JellyfishFirstAid } from "./EmergencyBlocks";
// Locked source edition — never edited in code. Guest edition is derived at render time.
import manuscript from "../../../content/the-rock/master-manuscript.v1.md?raw";

const APPENDIX_MARKER = "# EDITORIAL & IMPLEMENTATION APPENDIX";

/** Strips staff-only editorial markers so guests only see the guide itself. */
function toGuestEdition(src: string) {
  const idx = src.indexOf(APPENDIX_MARKER);
  let g = idx >= 0 ? src.slice(0, idx) : src;
  g = g
    .split("\n")
    .filter((l) => !/^\*\*Editorial status:\*\*/.test(l) && !/^\*Publication hold:/.test(l))
    .join("\n")
    .replace(/\s*·\s*(CLINICAL REVIEW|CONTACT VERIFICATION) REQUIRED/g, "")
    .replace(/\*\*\[NEW DRAFT\]\s*·\s*/g, "**")
    .replace(/\*\*\[NEW DRAFT\]\s*/g, "**")
    .replace(/\s*\[NEW DRAFT\]/g, "")
    .replace(/^\*\*\*\*\s*$/gm, "");
  return g;
}

export function TheRockReader() {
  const { segments, chapters } = useMemo(() => {
    const guide = toGuestEdition(manuscript);
    const chapters = Array.from(guide.matchAll(/^# (0\d) \/\/ (.+)$/gm)).map((m) => ({
      id: `dept-${m[1]}`,
      num: m[1],
      title: m[2],
    }));
    // Insert verified blocks without touching the locked source: after 004-03 (jellyfish) and after 004-08 (emergencies).
    const cut = (text: string, marker: string) => {
      const i = text.indexOf(marker);
      return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i)];
    };
    const [a, rest1] = cut(guide, "### FIELD REPORT 004-04");
    const [b, c] = cut(rest1, "# 05 //");
    return { segments: [a, b, c], chapters };
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs sm:text-sm text-muted-foreground">
        <strong className="text-foreground">Unofficial field guide.</strong> Practical advice from the camp, not
        legal or medical authority. Rules, prices and conditions change, so confirm locally. In an emergency, contact
        local emergency services first.
      </div>

      <nav aria-label="Departments" className="flex flex-wrap gap-2">
        {chapters.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            data-preview-allow
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:border-primary"
          >
            <span className="font-stat text-primary">{c.num}</span> {c.title}
          </a>
        ))}
      </nav>

      <a href="#emergency" data-preview-allow className="inline-flex min-h-11 items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 text-sm font-semibold text-destructive">
        Emergency numbers: 1669 · 191 · 1155
      </a>

      <article className="prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-blockquote:border-primary prose-hr:border-border">
        <Md>{segments[0]}</Md>
        {segments[1] && <JellyfishFirstAid />}
        <Md>{segments[1]}</Md>
        {segments[2] && (<div className="space-y-4 my-6"><EmergencyContacts /><MedicalFacilities /></div>)}
        <Md>{segments[2]}</Md>
      </article>
    </div>
  );
}

function Md({ children }: { children: string }) {
  if (!children) return null;
  return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => {
              const m = String(children).match(/^(0\d) \/\//);
              return (
                <h1 id={m ? `dept-${m[1]}` : undefined} className="scroll-mt-20 border-b border-border pb-2 tracking-wide">
                  {children}
                </h1>
              );
            },
            h3: ({ children }) => (
              <h3 className="mt-10 rounded-sm border-l-2 border-primary pl-3 text-base tracking-wide">{children}</h3>
            ),
          }}
        >
          {children}
        </ReactMarkdown>
  );
}
