/**
 * F-32: Message content sanitization
 * Strips HTML tags and potential XSS vectors from user-provided content.
 * Preserves plain text, newlines, and basic punctuation.
 */
export function sanitizeMessageContent(input: string): string {
  if (!input) return "";

  let clean = input
    // Strip HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove javascript: protocol
    .replace(/javascript:/gi, "")
    // Remove data: URIs that could embed scripts
    .replace(/data:\s*text\/html/gi, "")
    // Remove on* event handlers that might survive
    .replace(/\bon\w+\s*=/gi, "")
    // Normalize whitespace (preserve newlines)
    .replace(/[^\S\n]+/g, " ")
    .trim();

  // Limit message length to prevent abuse
  const MAX_LENGTH = 5000;
  if (clean.length > MAX_LENGTH) {
    clean = clean.slice(0, MAX_LENGTH);
  }

  return clean;
}

/**
 * F-53: PII minimization for AI prompts
 * Strips or masks PII from context before sending to AI models.
 */
export function minimizePII(text: string): string {
  if (!text) return "";

  return text
    // Mask email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
    // Mask phone numbers (various formats)
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, "[PHONE]")
    // Mask passport/ID numbers (common patterns: 2 letters + 6-9 digits)
    .replace(/\b[A-Z]{1,2}\d{6,9}\b/g, "[ID_DOC]");
}
