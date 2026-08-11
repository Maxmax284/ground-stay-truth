import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProperty } from "@/hooks/useProperty";
import { supabase } from "@/integrations/supabase/client";
import { getAIFocus, getAIRouteFocus } from "@/lib/aiFocusStore";

/**
 * "agent" is the deep, tool-calling ops mode (edge function `ai-agent`). Unlike
 * the other modes it is NOT streamed: the model may call several read tools
 * before it answers, so the reply arrives in one piece. It is staff-only and
 * can propose actions as drafts — it never executes anything.
 */
export type AIMode = "explain" | "summarize" | "validate" | "draft" | "digest" | "camp" | "agent";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  /** Read tools the agent called for this reply (agent mode only). */
  toolsUsed?: string[];
  /** Draft IDs the agent queued for approval (agent mode only). */
  draftIds?: string[];
}


function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

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

function parseSection(text: string, header: string): string | null {
  const re = new RegExp(`^\\s*${header}\\s*:\\s*([\\s\\S]*?)(?=^\\s*(?:QUICK ANSWER|WHAT I FOUND|SUGGESTED NEXT STEP|DRAFT MESSAGE|MISSING|SOURCES)\\s*:|\\Z)`, "im");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

export function useAIAssistant() {
  const { session, role } = useAuth();
  const { activePropertyId, operationalMode } = useProperty();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(newSessionId());

  // Client-side rate limiting: max 30 calls per 60 minutes
  const callTimestamps = useRef<number[]>([]);
  const RATE_LIMIT = 30;
  const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour


  // Cap conversation history sent to API to prevent unbounded token growth
  const MAX_HISTORY_MESSAGES = 12;
  // When history exceeds this, summarize older messages into a single context message
  const SUMMARIZE_THRESHOLD = 16;

  /** Compress older messages into a summary to reduce token costs */
  function compressHistory(allMessages: AIMessage[]): AIMessage[] {
    if (allMessages.length <= SUMMARIZE_THRESHOLD) {
      // Just trim to max
      return allMessages.length > MAX_HISTORY_MESSAGES
        ? allMessages.slice(-MAX_HISTORY_MESSAGES)
        : allMessages;
    }

    // Keep last MAX_HISTORY_MESSAGES messages, summarize the rest
    const oldMessages = allMessages.slice(0, -MAX_HISTORY_MESSAGES);
    const recentMessages = allMessages.slice(-MAX_HISTORY_MESSAGES);

    // Build a condensed summary of older exchanges
    const summaryParts: string[] = [];
    for (let i = 0; i < oldMessages.length; i += 2) {
      const userMsg = oldMessages[i];
      const assistantMsg = oldMessages[i + 1];
      if (userMsg?.role === "user") {
        const userSnippet = userMsg.content.slice(0, 80);
        const assistantSnippet = assistantMsg?.content?.slice(0, 120) || "(no reply)";
        summaryParts.push(`Q: ${userSnippet}${userMsg.content.length > 80 ? "…" : ""} → A: ${assistantSnippet}${(assistantMsg?.content?.length || 0) > 120 ? "…" : ""}`);
      }
    }

    const summaryMessage: AIMessage = {
      role: "user",
      content: `[Earlier conversation summary — ${oldMessages.length} messages condensed]\n${summaryParts.join("\n")}`,
      createdAt: Date.now(),
    };

    return [summaryMessage, ...recentMessages];
  }

  const sendMessage = useCallback(async (input: string, mode: AIMode = "explain", context?: Record<string, any>, language?: string) => {
    if (!session) return;

    // Enforce client-side rate limit
    const now = Date.now();
    callTimestamps.current = callTimestamps.current.filter((t) => now - t < RATE_WINDOW_MS);
    if (callTimestamps.current.length >= RATE_LIMIT) {
      setError("You've reached the message limit. Please wait before sending more.");
      return;
    }
    callTimestamps.current.push(now);

    const userMsg: AIMessage = { role: "user", content: input, createdAt: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setError(null);

    let assistantSoFar = "";
    const controller = new AbortController();
    abortRef.current = controller;

    // Compress history to control token costs
    const fullHistory = [...messages, userMsg];
    const trimmedHistory = compressHistory(fullHistory);

    try {
      // Fetch fresh session to avoid expired token 401s
      const { data: freshSession } = await supabase.auth.getSession();
      const accessToken = freshSession?.session?.access_token ?? session.access_token;

      // ── Agent mode: tool-calling, non-streamed, draft-only ───────────────
      // The agent decides which read tools to call, so the round trip is longer
      // and arrives as one JSON reply instead of an SSE stream.
      if (mode === "agent") {
        const agentResp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              messages: trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
              language,
              property_id: activePropertyId,
            }),
            signal: controller.signal,
          }
        );

        const agentBody = await agentResp.json().catch(() => ({}));
        if (!agentResp.ok) {
          if (agentResp.status === 429) setError("Rate limit exceeded. Please try again later.");
          else if (agentResp.status === 402) setError("AI credits exhausted. Please add credits.");
          else if (agentResp.status === 403) setError("Deep ops mode is staff only.");
          else setError(agentBody.error || "Ops agent error");
          setIsStreaming(false);
          return;
        }

        assistantSoFar = agentBody.reply || "";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantSoFar || "I couldn't put an answer together for that.",
            createdAt: Date.now(),
            toolsUsed: Array.isArray(agentBody.tools_used) ? agentBody.tools_used : [],
            draftIds: Array.isArray(agentBody.draft_ids) ? agentBody.draft_ids : [],
          },
        ]);
        setIsStreaming(false);
        return;
      }



      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            mode,
            role,
            property_id: activePropertyId,
            operational_mode: operationalMode,
            messages: trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
            context,
            language,
            focused_context: (() => {
              const f = getAIFocus();
              const r = getAIRouteFocus();
              if (f) {
                return { kind: f.kind, booking_id: f.bookingId, route: r?.route, page_key: r?.pageKey };
              }
              if (r) return { kind: "route", route: r.route, page_key: r.pageKey };
              return null;
            })(),
          }),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        if (resp.status === 429) {
          setError("Rate limit exceeded. Please try again later.");
        } else if (resp.status === 402) {
          setError("AI credits exhausted. Please add credits.");
        } else {
          setError(body.error || "AI assistant error");
        }
        setIsStreaming(false);
        return;
      }

      if (!resp.body) { setIsStreaming(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
                }
                return [...prev, { role: "assistant", content: assistantSoFar, createdAt: Date.now() }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Connection error");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;

      // Per-conversation audit log — metadata only, no message content or guest PII.
      if (assistantSoFar.trim().length > 0) {
        try {
          const focus = getAIFocus();
          const missingRaw = parseSection(assistantSoFar, "MISSING") || "";
          const sourcesRaw = parseSection(assistantSoFar, "SOURCES") || "";
          const missing = missingRaw
            ? missingRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12)
            : [];
          const sources = sourcesRaw
            ? sourcesRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12)
            : [];
          const uncertain =
            missing.length > 0 || UNCERTAINTY_PATTERNS.some((r) => r.test(assistantSoFar));

          const { data: freshSession } = await supabase.auth.getSession();
          const uid = freshSession?.session?.user?.id;
          if (uid) {
            await supabase.from("ai_assistant_audit").insert({
              user_id: uid,
              session_id: sessionIdRef.current,
              assistant_response_at: new Date().toISOString(),
              mode,
              focus_kind: focus?.kind ?? null,
              focus_booking_id: focus?.bookingId ?? null,
              uncertain,
              missing,
              sources,
              notes: uncertain ? "flagged_uncertain" : null,
            });
          }
        } catch {
          /* audit best-effort; never surface to user */
        }
      }
    }
  }, [session, role, messages, activePropertyId, operationalMode]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdRef.current = newSessionId();
  }, []);


  return { messages, isStreaming, error, sendMessage, cancel, clearChat };
}
