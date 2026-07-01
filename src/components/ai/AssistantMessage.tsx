import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, FileText, AlertCircle, MessageCircle, Mail, HandHelping } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAIFocus } from "@/lib/aiFocusStore";
import { toast } from "@/hooks/use-toast";

const UNCERTAINTY_PATTERNS = [
  /\bi(?:'m| am)? not sure\b/i,
  /\bi don'?t know\b/i,
  /\bunclear\b/i,
  /\bcannot determine\b/i,
  /\bcan'?t determine\b/i,
  /\bunable to\b/i,
  /\bi don'?t have\b/i,
  /\bneed more (?:info|information|context)\b/i,
  /\binsufficient (?:info|information|context|data)\b/i,
  /\bno (?:record|data|info) (?:found|available)\b/i,
];

function detectUncertainty(text: string): boolean {
  return UNCERTAINTY_PATTERNS.some((r) => r.test(text));
}

interface ParsedResponse {
  intro?: string;
  quickAnswer?: string;
  whatIFound?: string;
  suggestedNextStep?: string;
  draftMessage?: string;
  missing?: string;
  sources?: string;
  raw: string;
}

const SECTION_HEADERS = [
  "QUICK ANSWER",
  "WHAT I FOUND",
  "SUGGESTED NEXT STEP",
  "DRAFT MESSAGE",
  "MISSING",
  "SOURCES",
] as const;

/**
 * Parses the assistant response for known section headers.
 * Falls back to raw content if no structured headers are present.
 */
function parseResponse(content: string): ParsedResponse {
  const result: ParsedResponse = { raw: content };
  const headerPattern = new RegExp(
    `^\\s*(${SECTION_HEADERS.join("|")})\\s*:\\s*`,
    "im"
  );
  if (!headerPattern.test(content)) return result;

  // Split by section headers while keeping them
  const regex = new RegExp(
    `^\\s*(${SECTION_HEADERS.join("|")})\\s*:\\s*`,
    "gim"
  );
  const parts: { header: string; body: string; start: number }[] = [];
  let match: RegExpExecArray | null;
  const matches: { header: string; index: number; end: number }[] = [];
  while ((match = regex.exec(content)) !== null) {
    matches.push({ header: match[1].toUpperCase(), index: match.index, end: match.index + match[0].length });
  }

  const firstHeaderIdx = matches[0]?.index ?? content.length;
  const intro = content.slice(0, firstHeaderIdx).trim();
  if (intro) result.intro = intro;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    const body = content.slice(m.end, next ? next.index : content.length).trim();
    parts.push({ header: m.header, body, start: m.index });
  }

  for (const p of parts) {
    switch (p.header) {
      case "QUICK ANSWER": result.quickAnswer = p.body; break;
      case "WHAT I FOUND": result.whatIFound = p.body; break;
      case "SUGGESTED NEXT STEP": result.suggestedNextStep = p.body; break;
      case "DRAFT MESSAGE": result.draftMessage = p.body; break;
      case "MISSING": result.missing = p.body; break;
      case "SOURCES": result.sources = p.body; break;
    }
  }
  return result;
}

const markdownComponents = {
  p: ({ children }: any) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 space-y-0.5 my-1.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 space-y-0.5 my-1.5">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">{children}</code>
    ) : (
      <pre className="rounded bg-muted p-2 text-xs font-mono overflow-x-auto my-1.5"><code>{children}</code></pre>
    ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{children}</a>
  ),
  h1: ({ children }: any) => <p className="font-semibold text-sm mt-2 mb-1">{children}</p>,
  h2: ({ children }: any) => <p className="font-semibold text-sm mt-2 mb-1">{children}</p>,
  h3: ({ children }: any) => <p className="font-semibold text-sm mt-2 mb-1">{children}</p>,
};

function MD({ children }: { children: string }) {
  return (
    <div className="text-sm text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

function CopyButton({ text, label = "Copy", size = "xs" }: { text: string; label?: string; size?: "xs" | "sm" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };
  const sizeCls = size === "sm" ? "h-7 px-2 text-xs" : "h-6 px-1.5 text-[11px]";
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("gap-1 text-muted-foreground hover:text-foreground", sizeCls)}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span>{copied ? "Copied" : label}</span>
    </Button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
      {children}
    </div>
  );
}

interface AssistantMessageProps {
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export function AssistantMessage({ content, timestamp, isStreaming }: AssistantMessageProps) {
  const parsed = useMemo(() => parseResponse(content), [content]);
  const hasStructure = !!(parsed.quickAnswer || parsed.whatIFound || parsed.suggestedNextStep || parsed.draftMessage);
  const focus = useAIFocus();

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const sourceChips = parsed.sources
    ? parsed.sources.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const missingChips = parsed.missing
    ? parsed.missing.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const uncertain = useMemo(
    () => detectUncertainty(parsed.quickAnswer || parsed.whatIFound || content),
    [parsed.quickAnswer, parsed.whatIFound, content]
  );
  const needsReview = missingChips.length > 0 || uncertain;

  const handleRequestReview = async () => {
    const lines: string[] = [];
    lines.push("🙋 Human review requested — Kru Glitch flagged uncertainty.");
    if (focus?.label) lines.push(`Focus: ${focus.label}`);
    if (focus?.bookingId) lines.push(`Booking: ${focus.bookingId}`);
    if (missingChips.length) lines.push(`Missing: ${missingChips.join(", ")}`);
    if (parsed.quickAnswer) lines.push(`\nAssistant said: ${parsed.quickAnswer.slice(0, 400)}`);
    lines.push("\nPlease review and take it from here.");
    const draft = lines.join("\n");
    try {
      await navigator.clipboard.writeText(draft);
      toast({
        title: "Review request copied",
        description: "Paste into your staff channel or messaging thread.",
      });
    } catch {
      toast({
        title: "Couldn't copy automatically",
        description: "Select the assistant text and share it manually.",
        variant: "destructive",
      });
    }
  };

  const cleanDraft = parsed.draftMessage
    ? parsed.draftMessage.replace(/—\s*Draft only.*$/i, "").trim()
    : "";
  const waPhone = focus?.guestPhone?.replace(/[^\d+]/g, "").replace(/^\+/, "") || "";
  const waHref = cleanDraft && waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(cleanDraft)}`
    : cleanDraft
      ? `https://wa.me/?text=${encodeURIComponent(cleanDraft)}`
      : null;
  const mailHref = cleanDraft && focus?.guestEmail
    ? `mailto:${focus.guestEmail}?body=${encodeURIComponent(cleanDraft)}`
    : null;

  return (
    <div className="group mr-4">
      <div className="border-l-2 border-primary/40 pl-3 py-1">
        {parsed.intro && <MD>{parsed.intro}</MD>}

        {hasStructure ? (
          <div className="space-y-3">
            {parsed.quickAnswer && (
              <div>
                <SectionLabel>Quick Answer</SectionLabel>
                <MD>{parsed.quickAnswer}</MD>
              </div>
            )}
            {parsed.whatIFound && (
              <div>
                <SectionLabel>What I Found</SectionLabel>
                <MD>{parsed.whatIFound}</MD>
              </div>
            )}
            {parsed.suggestedNextStep && (
              <div>
                <SectionLabel>Suggested Next Step</SectionLabel>
                <MD>{parsed.suggestedNextStep}</MD>
              </div>
            )}
            {parsed.draftMessage && (
              <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold">Draft Message</span>
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                      Draft only — not sent
                    </Badge>
                  </div>
                  <CopyButton text={cleanDraft} label="Copy draft" />
                </div>
                <div className="text-sm">
                  <MD>{cleanDraft}</MD>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {waHref && (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-1 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      <MessageCircle className="h-3 w-3" />
                      {waPhone ? "Open in WhatsApp" : "WhatsApp (no number)"}
                    </a>
                  )}
                  {mailHref && (
                    <a
                      href={mailHref}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-1 text-[11px] font-medium hover:bg-blue-500/20 transition-colors"
                    >
                      <Mail className="h-3 w-3" />
                      Email
                    </a>
                  )}
                  {focus && !focus.guestPhone && !focus.guestEmail && (
                    <span className="text-[10px] text-muted-foreground italic">
                      No guest contact on file — copy the draft and send manually.
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 italic">
                  This is a draft. An admin needs to send it.
                </p>
              </div>
            )}
          </div>
        ) : (
          !parsed.intro && <MD>{content || " "}</MD>
        )}

        {(missingChips.length > 0 || sourceChips.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {missingChips.map((m) => (
              <Badge
                key={`m-${m}`}
                variant="outline"
                className="text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5"
              >
                <AlertCircle className="h-2.5 w-2.5" />
                Missing: {m}
              </Badge>
            ))}
            {sourceChips.map((s) => {
              const isFocused = /focused/i.test(s);
              return (
                <Badge
                  key={`s-${s}`}
                  variant={isFocused ? "default" : "secondary"}
                  className={cn(
                    "text-[10px]",
                    isFocused && "bg-primary/15 text-primary hover:bg-primary/20 border border-primary/30"
                  )}
                  title={isFocused ? "Grounded to the booking you have open" : `Source: ${s}`}
                >
                  {s}
                </Badge>
              );
            })}
          </div>
        )}

        {needsReview && !isStreaming && (
          <div className="mt-2.5 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-700 dark:text-amber-300 flex-1">
              {missingChips.length > 0
                ? "Missing info — a human may need to weigh in."
                : "Kru Glitch isn't fully sure. Loop in a teammate?"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRequestReview}
              className="h-6 px-2 text-[11px] gap-1 border-amber-500/50 hover:bg-amber-500/10"
            >
              <HandHelping className="h-3 w-3" />
              Request human review
            </Button>
          </div>
        )}
      </div>


      {!isStreaming && (
        <div className="mt-1 flex items-center gap-2 pl-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-muted-foreground">{timeStr}</span>
          <CopyButton text={content} label="Copy" />
        </div>
      )}
    </div>
  );
}

export function UserMessage({ content, timestamp }: { content: string; timestamp: number }) {
  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="group ml-8 flex flex-col items-end">
      <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 max-w-full">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
      </div>
      <span className="text-[10px] text-muted-foreground mt-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {timeStr}
      </span>
    </div>
  );
}
