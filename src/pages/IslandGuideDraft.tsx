import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Locked source edition — rendered verbatim, never edited in code.
import manuscript from "../../content/the-rock/master-manuscript.v1.md?raw";

const SOURCE_SHA256 = "12beae00a67acee5275c286b3ef6c08dc943ff90f666054e25c3d3505b6d8b7b";
const APPENDIX_MARKER = "# EDITORIAL & IMPLEMENTATION APPENDIX";

/**
 * Staff-only review render of THE ROCK (Phase 1+2 prototype).
 * Not linked from the guest portal, not public. Publication stays on hold
 * until fact-check, photo rights and translation review are signed off.
 */
export default function IslandGuideDraft() {
  const [showAppendix, setShowAppendix] = useState(false);

  const { guide, appendix, chapters, reports, newDrafts } = useMemo(() => {
    const idx = manuscript.indexOf(APPENDIX_MARKER);
    const guide = idx >= 0 ? manuscript.slice(0, idx) : manuscript;
    const appendix = idx >= 0 ? manuscript.slice(idx) : "";
    const chapters = Array.from(guide.matchAll(/^# (0\d) \/\/ (.+)$/gm)).map((m) => ({
      id: `dept-${m[1]}`,
      num: m[1],
      title: m[2],
    }));
    const reports = (guide.match(/^### (FIELD REPORT|FEATURE|DON'T BE THAT GUY)/gm) ?? []).length;
    const newDrafts = (manuscript.match(/\[NEW DRAFT\]/g) ?? []).length;
    return { guide, appendix, chapters, reports, newDrafts };
  }, []);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-5 pb-16">
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs sm:text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="uppercase tracking-wider text-[10px]">Staff review draft</Badge>
            <Badge variant="outline" className="text-[10px]">v1 · {chapters.length} departments · {reports} reports</Badge>
            <Badge variant="outline" className="text-[10px]">{newDrafts} [NEW DRAFT] passages</Badge>
          </div>
          <p className="mt-2 text-muted-foreground">
            Verbatim master manuscript. Not visible to guests or the public. Safety, legal and
            time-sensitive claims are unverified until fact-checked. Source fingerprint{" "}
            <code className="break-all">{SOURCE_SHA256.slice(0, 16)}…</code>
          </p>
        </div>

        <nav aria-label="Departments" className="flex flex-wrap gap-2">
          {chapters.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:border-primary"
            >
              <span className="font-stat text-primary">{c.num}</span> {c.title}
            </a>
          ))}
        </nav>

        <article className="prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-blockquote:border-primary prose-hr:border-border">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => {
                const text = String(children);
                const m = text.match(/^(0\d) \/\//);
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
            {guide}
          </ReactMarkdown>
        </article>

        {appendix && (
          <div className="border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => setShowAppendix((v) => !v)}>
              {showAppendix ? "Hide" : "Show"} editorial appendix (staff notes)
            </Button>
            {showAppendix && (
              <article className="prose prose-sm mt-4 max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{appendix}</ReactMarkdown>
              </article>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
