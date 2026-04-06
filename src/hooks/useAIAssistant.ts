import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProperty } from "@/hooks/useProperty";
import { supabase } from "@/integrations/supabase/client";

export type AIMode = "explain" | "summarize" | "validate" | "draft" | "digest" | "camp";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export function useAIAssistant() {
  const { session, role } = useAuth();
  const { activePropertyId, operationalMode } = useProperty();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

    const userMsg: AIMessage = { role: "user", content: input };
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
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
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
                return [...prev, { role: "assistant", content: assistantSoFar }];
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
    }
  }, [session, role, messages, activePropertyId, operationalMode]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isStreaming, error, sendMessage, cancel, clearChat };
}
