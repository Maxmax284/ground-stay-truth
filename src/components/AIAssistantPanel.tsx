import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Swords, X, Send, Trash2, Sparkles, AlertTriangle, Globe, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAIAssistant, type AIMode } from "@/hooks/useAIAssistant";
import { useAISettings } from "@/hooks/useAISettings";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { AssistantMessage, UserMessage } from "@/components/ai/AssistantMessage";
import { LoadingIndicator } from "@/components/ai/LoadingIndicator";
import { getQuickPromptsForRole, FOCUSED_BOOKING_PROMPTS } from "@/components/ai/QuickPrompts";
import { useAIFocus } from "@/lib/aiFocusStore";
import { Focus } from "lucide-react";
import React from "react";

const MODE_LABELS: Record<AIMode, string> = {
  explain: "ai.modes.explain",
  summarize: "ai.modes.summarize",
  validate: "ai.modes.validate",
  draft: "ai.modes.draft",
  digest: "ai.modes.digest",
  camp: "ai.modes.camp",
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "th", label: "ภาษาไทย", name: "Thai" },
  { code: "fr", label: "Français", name: "French" },
  { code: "de", label: "Deutsch", name: "German" },
  { code: "ru", label: "Русский", name: "Russian" },
  { code: "zh", label: "中文", name: "Chinese" },
  { code: "ja", label: "日本語", name: "Japanese" },
  { code: "ko", label: "한국어", name: "Korean" },
  { code: "es", label: "Español", name: "Spanish" },
];

function langCodeToName(code: string): string {
  const found = LANGUAGES.find((l) => l.code === code);
  return found?.name || found?.label || "English";
}

// Error boundary wrapper
class AIErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// Snap corners: returns the nearest corner position for a given point
const CORNER_MARGIN = 24;
const BUBBLE_SIZE = 56;

function snapToCorner(x: number, y: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const corners = [
    { x: CORNER_MARGIN, y: CORNER_MARGIN }, // top-left
    { x: vw - BUBBLE_SIZE - CORNER_MARGIN, y: CORNER_MARGIN }, // top-right
    { x: CORNER_MARGIN, y: vh - BUBBLE_SIZE - CORNER_MARGIN }, // bottom-left
    { x: vw - BUBBLE_SIZE - CORNER_MARGIN, y: vh - BUBBLE_SIZE - CORNER_MARGIN }, // bottom-right
  ];
  const centerX = x + BUBBLE_SIZE / 2;
  const centerY = y + BUBBLE_SIZE / 2;
  let nearest = corners[3]; // default bottom-right
  let minDist = Infinity;
  for (const c of corners) {
    const cx = c.x + BUBBLE_SIZE / 2;
    const cy = c.y + BUBBLE_SIZE / 2;
    const dist = Math.sqrt((centerX - cx) ** 2 + (centerY - cy) ** 2);
    if (dist < minDist) { minDist = dist; nearest = c; }
  }
  return nearest;
}

function AIAssistantPanelInner() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { profile } = useProfile();
  const { isAIEnabled, isLoading: settingsLoading } = useAISettings(role);
  const { messages, isStreaming, error, sendMessage, cancel, clearChat } = useAIAssistant();
  const isMobile = useIsMobile();
  const quickPrompts = getQuickPromptsForRole(role);
  const focus = useAIFocus();
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AIMode>("explain");
  const [language, setLanguage] = useState<string>("en");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [bubbleDragging, setBubbleDragging] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Draggable position — used for BOTH bubble and open panel
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // --- Bubble drag handlers ---
  const handleBubblePointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    const el = bubbleRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
  }, []);

  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleBubblePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    // Only count as drag if moved more than 8px
    if (!hasDraggedRef.current && Math.sqrt(dx * dx + dy * dy) < 8) return;
    hasDraggedRef.current = true;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    const maxX = window.innerWidth - BUBBLE_SIZE;
    const maxY = window.innerHeight - BUBBLE_SIZE;
    setBubblePos({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, []);

  const handleBubblePointerUp = useCallback(() => {
    const wasDragging = hasDraggedRef.current;
    isDraggingRef.current = false;
    if (wasDragging && bubblePos) {
      // Snap to nearest corner
      const snapped = snapToCorner(bubblePos.x, bubblePos.y);
      setBubblePos(snapped);
    }
    if (!wasDragging) {
      setIsOpen(true);
    }
    hasDraggedRef.current = false;
  }, [bubblePos]);

  // --- Open panel drag handlers (header grip) ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    const maxX = window.innerWidth - (panelRef.current?.offsetWidth ?? 380);
    const maxY = window.innerHeight - (panelRef.current?.offsetHeight ?? 400);
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Set default language from profile
  useEffect(() => {
    if (profile.data?.preferred_language) {
      setLanguage(profile.data.preferred_language);
    }
  }, [profile.data?.preferred_language]);

  // Listen for external "ask Kru Glitch" events (from Corner Talk)
  useEffect(() => {
    const handler = (e: CustomEvent<{ question: string }>) => {
      setIsOpen(true);
      setMode("digest");
      const q = e.detail?.question;
      if (q) {
        setInput("");
        sendMessage(q, "digest", undefined, langCodeToName(language));
      }
    };
    window.addEventListener("ask-kru-glitch", handler as EventListener);
    return () => window.removeEventListener("ask-kru-glitch", handler as EventListener);
  }, [sendMessage, language]);

  // Context isolation: clear chat when staff switches between bookings
  useEffect(() => {
    const handler = () => {
      clearChat();
    };
    window.addEventListener("kru-glitch-clear", handler);
    return () => window.removeEventListener("kru-glitch-clear", handler);
  }, [clearChat]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  if (settingsLoading || !isAIEnabled) return null;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    sendMessage(trimmed, mode, undefined, langCodeToName(language));
  };

  // Bubble style
  const bubbleStyle: React.CSSProperties = bubblePos
    ? { position: "fixed", left: bubblePos.x, top: bubblePos.y, bottom: "auto", right: "auto" }
    : {};



  const isGuest = role === "guest";

  if (!isOpen) {
    return (
      <div
        ref={bubbleRef}
        style={{
          ...bubbleStyle,
          transition: bubbleDragging ? "none" : "left 0.3s ease-out, top 0.3s ease-out",
        }}
        className={`${!bubblePos ? "fixed bottom-6 right-6 md:bottom-6 bottom-20" : ""} z-50 select-none touch-none`}
        onPointerDown={(e) => { setBubbleDragging(true); handleBubblePointerDown(e); }}
        onPointerMove={handleBubblePointerMove}
        onPointerUp={() => { setBubbleDragging(false); handleBubblePointerUp(); }}
      >
        {isGuest ? (
          <div
            className={`flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl px-4 py-3 ${bubbleDragging ? "scale-105 cursor-grabbing" : "cursor-grab hover:scale-105"} transition-transform`}
            aria-label={t("ai.openAssistant")}
          >
            <Sparkles className="h-5 w-5 pointer-events-none shrink-0" />
            <span className="text-sm font-medium pointer-events-none whitespace-nowrap">{t("ai.openAssistant")}</span>
          </div>
        ) : (
          <div
            className={`h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl flex items-center justify-center animate-pulse-ring ${bubbleDragging ? "scale-110 cursor-grabbing" : "cursor-grab hover:scale-105"} transition-transform`}
            aria-label={t("ai.openAssistant")}
          >
            <Sparkles className="h-6 w-6 pointer-events-none" />
          </div>
        )}
      </div>
    );
  }

  // On mobile, ignore drag position and render as bottom sheet
  const panelStyle: React.CSSProperties = !isMobile && position
    ? { position: "fixed", left: position.x, top: position.y, bottom: "auto", right: "auto", zIndex: 50 }
    : {};

  const mobileClasses = isMobile
    ? "fixed inset-x-0 bottom-0 z-50 w-full max-w-full rounded-t-2xl rounded-b-none border-b-0 max-h-[85dvh] shadow-2xl"
    : `${!position ? "fixed bottom-6 right-6 md:bottom-6 bottom-20" : ""} z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl max-h-[min(32rem,calc(100vh-8rem))] shadow-2xl`;

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      onPointerMove={isMobile ? undefined : handlePointerMove}
      onPointerUp={isMobile ? undefined : handlePointerUp}
      className={`${mobileClasses} bg-card border border-border flex flex-col animate-slide-up`}
    >
      {/* Header with drag handle (desktop only) */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          {!isMobile && (
            <div
              className="cursor-grab active:cursor-grabbing p-2 -ml-2 rounded hover:bg-accent/50"
              onPointerDown={handlePointerDown}
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <Swords className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{t("ai.title")}</span>
          <Badge variant="secondary" className="text-[10px]">{t("ai.assistOnly")}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t("ai.language")}>
                <Globe className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[60]">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={language === lang.code ? "bg-accent" : ""}
                >
                  {lang.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearChat} title={t("ai.clearChat")}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setIsOpen(false); setPosition(null); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mode selector — filter staff-only modes for guests */}
      <div className="flex gap-1 px-3 py-2 border-b overflow-x-auto">
        {(Object.keys(MODE_LABELS) as AIMode[])
          .filter((m) => {
            if (role === "guest") {
              return ["explain", "summarize", "camp"].includes(m);
            }
            return true;
          })
          .map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-[11px] px-2 py-1 rounded-md whitespace-nowrap transition-all duration-200 ${
              mode === m ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t(MODE_LABELS[m])}
          </button>
        ))}
      </div>

      {/* Focus chip — shows what booking Kru Glitch is grounded to */}
      {focus && role !== "guest" && (
        <div className="px-3 py-1.5 border-b bg-primary/5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Focus className="h-3 w-3 text-primary shrink-0" />
          <span className="shrink-0 font-medium text-foreground">Focused on:</span>
          <span className="truncate">{focus.label || `Booking ${focus.bookingId.slice(0, 8)}`}</span>
        </div>
      )}

      {/* Messages - fixed scroll */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-3 space-y-4">
          {messages.length === 0 && (
            <div className="py-4 animate-fade-up">
              <div className="text-center mb-4">
                <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("ai.welcomeMessage")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("ai.disclaimer")}</p>
              </div>
              {quickPrompts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                    Try asking
                  </p>
                  {quickPrompts.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => {
                        setInput("");
                        sendMessage(qp.prompt, mode, undefined, langCodeToName(language));
                      }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 hover:bg-accent text-xs text-foreground transition-colors"
                    >
                      <span className="text-primary shrink-0">{qp.icon}</span>
                      <span className="truncate">{qp.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === "assistant" && i === messages.length - 1 && !isStreaming;
            const isShortResponse = isLastAssistant && msg.content.length < 400;
            return (
              <div key={i} className="animate-fade-up">
                {msg.role === "user" ? (
                  <UserMessage content={msg.content} timestamp={msg.createdAt} />
                ) : (
                  <>
                    <AssistantMessage
                      content={msg.content}
                      timestamp={msg.createdAt}
                      isStreaming={i === messages.length - 1 && isStreaming}
                    />
                    {isShortResponse && (
                      <button
                        onClick={() => sendMessage("Go deeper — give me the full details on that.", mode, undefined, langCodeToName(language))}
                        className="ml-3 mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                      >
                        <Sparkles className="h-3 w-3" />
                        {t("ai.wantMoreDetail", "Want more detail?")}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <LoadingIndicator />
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 animate-shake-subtle">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ai.inputPlaceholder")}
            className="min-h-[40px] max-h-[80px] text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          <Button
            size="icon"
            onClick={isStreaming ? cancel : handleSend}
            disabled={!isStreaming && !input.trim()}
            className="shrink-0 self-end"
          >
            {isStreaming ? <X className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}


export function AIAssistantPanel() {
  return (
    <AIErrorBoundary fallback={null}>
      <AIAssistantPanelInner />
    </AIErrorBoundary>
  );
}
