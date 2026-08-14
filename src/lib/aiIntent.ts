/**
 * Kru Glitch answer discipline — intent depth classifier.
 *
 * Pure, deterministic, client-side. The classified intent travels with the
 * chat request so the backend can swap the response contract: simple lookups
 * get a compact list, deep questions keep the full structured format.
 *
 * No data access, no side effects.
 */

export type AIIntent =
  | "simple_lookup"
  | "operational_summary"
  | "deep_analysis"
  | "action_request";

/** Phrases that mean "ignore my current page, look across everything". */
const GLOBAL_PATTERNS = [
  /\bacross the (?:whole |entire )?platform\b/i,
  /\ball (?:guests|bookings|rooms|units|properties)\b/i,
  /\bplatform[- ]wide\b/i,
  /\beverywhere\b/i,
  /\beveryone\b/i,
];

/** Action verbs — these must stay Plan → Approve → Execute. */
const ACTION_PATTERNS = [
  /^\s*(?:please\s+)?(?:assign|move|mark|set|create|prepare|draft|send|schedule|cancel|refund|charge|record|approve|reject|block|release)\b/i,
  /\bmove (?:this|that|the) (?:task|booking|guest|room)\b/i,
  /\bdraft (?:a|an|the)\b/i,
  /\bprepare (?:a|an|the)\b/i,
  /\bassign\b.+\bto\b/i,
];

/** Deep-dive requests — full breakdown allowed. */
const DEEP_PATTERNS = [
  /\bexplain\b/i,
  /\bwhy\b/i,
  /\bbreak(?:\s|-)?down\b/i,
  /\baudit\b/i,
  /\bwhat (?:changed|happened)\b/i,
  /\bfull (?:details|breakdown|picture|story)\b/i,
  /\bmore detail\b/i,
  /\bin detail\b/i,
  /\btimeline\b/i,
  /\bwalk me through\b/i,
  /\btroubleshoot\b/i,
  /\bhow do i\b/i,
  /\bwhat is this (?:page|feature)\b/i,
];

/** Compact operational roll-ups. */
const SUMMARY_PATTERNS = [
  /\bneeds? attention\b/i,
  /\bbrief(?:ing)?\b/i,
  /\bwhat should (?:staff|we|i) watch\b/i,
  /\bany problems\b/i,
  /\bwhat'?s? going on\b/i,
  /\btoday'?s board\b/i,
  /\bsummar(?:y|ize|ise)\b/i,
  /\bsnapshot\b/i,
  /\boverview\b/i,
];

/** Simple operational lookups — the front-desk bread and butter. */
const LOOKUP_PATTERNS = [
  /\bwho'?s?\s+(?:is\s+)?check(?:ing)?[- ]?(?:in|out)\b/i,
  /\bcheck[- ]?(?:ins?|outs?)\b/i,
  /\bwho owes\b/i,
  /\bunpaid\b/i,
  /\boutstanding balance/i,
  /\bbalances? due\b/i,
  /\bpayments? due\b/i,
  /\bwhich rooms? (?:are )?(?:free|available|open)\b/i,
  /\bwhat rooms? (?:are )?(?:free|available|open)\b/i,
  /\bpickups?\b/i,
  /\bpassport\b/i,
  /\bmissing documents?\b/i,
  /\btm30\b/i,
  /\bwhat'?s? broken\b/i,
  /\bopen maintenance\b/i,
  /\bneeds? cleaning\b/i,
  /\bhousekeeping\b/i,
  /\bhow many\b/i,
  /\bwho (?:needs|has)\b/i,
];

export interface IntentClassification {
  intent: AIIntent;
  /** True when the user explicitly asked to look beyond the current page. */
  global: boolean;
}

export function isGlobalScopeRequest(text: string): boolean {
  return GLOBAL_PATTERNS.some((r) => r.test(text));
}

/**
 * Classify a user question by depth. Order matters: actions first (they are
 * never "just a lookup"), then explicit deep-dive wording, then summaries,
 * then lookups. Anything unrecognised falls back to deep_analysis so we never
 * truncate a question we don't understand.
 */
export function classifyIntent(input: string): AIIntent {
  const text = (input ?? "").trim();
  if (!text) return "deep_analysis";

  if (ACTION_PATTERNS.some((r) => r.test(text))) return "action_request";
  if (DEEP_PATTERNS.some((r) => r.test(text))) return "deep_analysis";
  if (SUMMARY_PATTERNS.some((r) => r.test(text))) return "operational_summary";
  if (LOOKUP_PATTERNS.some((r) => r.test(text))) return "simple_lookup";

  // Short, question-shaped, no deep markers → treat as a lookup.
  const words = text.split(/\s+/).length;
  if (words <= 10 && /\?$/.test(text)) return "simple_lookup";

  return "deep_analysis";
}

export function classify(input: string): IntentClassification {
  return { intent: classifyIntent(input), global: isGlobalScopeRequest(input ?? "") };
}
