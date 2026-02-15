

# "Kru" -- AI Assistant Rebrand, Personality Overhaul, Scroll Fix, and Language Support

## The Name: Kru

"Kru" means "teacher" in Thai -- it's what Muay Thai fighters call their trainers and coaches. It's short, punchy, culturally authentic, and perfectly fits an advisory-only assistant at a Muay Thai gym. No more generic "AI Assistant."

---

## Problem 1: Scroll is broken

The `ScrollArea` wraps a `div` with `ref={scrollRef}`, but the scroll container is actually the internal Radix viewport, not the outer div. The `scrollRef` is attached to an inner div that never overflows. This means:
- Messages pile up but the panel never scrolls
- Users can't see earlier messages

**Fix:** Replace the `ScrollArea` + inner div pattern with a simple `overflow-y-auto` div that has `scrollRef` directly on it, so `scrollTop = scrollHeight` actually works.

---

## Problem 2: Responses are too long and robotic

The system prompt in the edge function tells the AI to be "operational" but doesn't enforce brevity or personality. The result is bullet-heavy, verbose, markdown-heavy output with options the user didn't ask for.

**Fix:** Rewrite the system prompt to:
- Cap responses at 2-3 sentences by default
- Use a casual, warm, coach-like tone ("Alright, here's the deal..." not "I'm ready to assist with your next request")
- Mirror the user's energy -- if they're brief, be brief back
- Drop the markdown formatting (no bold options lists)
- Only elaborate when explicitly asked
- Sign off with fight-camp flavor when appropriate

---

## Problem 3: No language support

The AI always responds in English regardless of the user's `preferred_language` setting. There's no way to switch languages in the chat panel.

**Fix:**
- Pass the user's `preferred_language` from their profile to the edge function
- Add a language instruction to the system prompt: "Respond in [language]"
- Add a small language selector (globe icon) in the panel header so users can override on the fly
- Default to the user's profile language, fall back to English

---

## Implementation Details

### File: `supabase/functions/ai-assistant/index.ts`

**System prompt rewrite:**
```
You are Kru -- the camp's resident advisor at Ground Stay, a Muay Thai fight camp accommodation.

PERSONALITY:
- Talk like a friendly, experienced corner coach. Warm but direct.
- Keep answers to 2-3 sentences unless the user asks for detail.
- Match the user's energy. Short question = short answer. Detailed question = more thorough.
- Never use markdown bold, bullet lists, or "Option:" prefixes unless explicitly asked for a list.
- Use natural language, not corporate-speak. "Here's the deal" not "I'm ready to assist."
- You can be lightly humorous when appropriate, but always respectful.

RULES:
- You NEVER execute actions, modify state, or record payments.
- You are read-only. Explain, summarize, suggest only.
- Use "Heads up:" for warnings, "Suggestion:" for recommendations.
- Never expose payment amounts to front_desk role users.
- Never expose internal notes to guest role users.

LANGUAGE: Respond in {{LANGUAGE}}.
```

**New request field:** Accept `language` from the client and inject it into the prompt. Default to "English" if not provided.

### File: `src/hooks/useAIAssistant.ts`

- Add `language` parameter to `sendMessage` function signature
- Pass `language` in the request body alongside `mode`, `role`, `messages`, `context`

### File: `src/components/AIAssistantPanel.tsx`

**Rebrand:**
- Change header from "AI Assistant" to "Kru"
- Change icon from `Bot` to `Swords` (already used in sidebar, fits the theme)
- Change badge from "Assist Only" to "Advisory"
- Update welcome message to something like: "Hey -- I'm Kru, your camp advisor. Ask me anything about the property, bookings, or ops."
- Update placeholder from "Ask about operations..." to "Ask Kru anything..."

**Scroll fix:**
- Remove `ScrollArea` component wrapper
- Use a plain `div` with `overflow-y-auto flex-1 min-h-0` and attach `scrollRef` directly to it
- This ensures `scrollTop = scrollHeight` actually scrolls

**Language selector:**
- Add a small `Globe` icon button in the header (next to clear/close)
- Clicking it opens a dropdown with the 9 supported languages
- Store the selected language in component state, defaulting to the user's `preferred_language` from `useProfile`
- Pass the selected language to `sendMessage`

**Response display:**
- Keep `whitespace-pre-wrap` for natural line breaks
- No markdown rendering needed (the prompt now discourages markdown)

### File: `src/i18n/locales/en.json`

Update the `ai` section:
- `ai.title`: "Kru"
- `ai.assistOnly`: "Advisory"
- `ai.openAssistant`: "Ask Kru"
- `ai.welcomeMessage`: "Hey -- I'm Kru, your camp advisor. Ask me anything about the property, bookings, or ops."
- `ai.disclaimer`: "I only advise -- I never take actions."
- `ai.inputPlaceholder`: "Ask Kru anything..."
- `ai.language`: "Response Language"

### Files Summary

| File | Change |
|------|--------|
| `supabase/functions/ai-assistant/index.ts` | Rewrite system prompt for personality + brevity + language support |
| `src/hooks/useAIAssistant.ts` | Add `language` parameter to `sendMessage` |
| `src/components/AIAssistantPanel.tsx` | Rebrand to "Kru", fix scroll, add language selector |
| `src/i18n/locales/en.json` | Update AI-related translation keys |

### No new dependencies needed

