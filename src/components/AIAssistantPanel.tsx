import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Swords, X, Send, Trash2, Sparkles, AlertTriangle, Globe, GripVertical, Lightbulb, ChevronDown, ChevronUp, Maximize2, Minimize2, KeyRound, Volume2, VolumeX, Loader2, Lock, MoreVertical, RotateCcw, Columns2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useSpokenReply } from "@/hooks/useSpokenReply";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAIPanelMode,
  panelBoxClasses,
  clampPos,
  readStoredPos,
  writeStoredPos,
  AI_PANEL_MODES,
  AI_PANEL_MODE_LABELS,
} from "@/lib/aiPanelLayout";
import { useAIAssistant, type AIMode } from "@/hooks/useAIAssistant";
import { useAISettings } from "@/hooks/useAISettings";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { AssistantMessage, UserMessage } from "@/components/ai/AssistantMessage";
import { LoadingIndicator } from "@/components/ai/LoadingIndicator";
import { getQuickPromptsForRole, FOCUSED_BOOKING_PROMPTS, CONTROL_MODE_PROMPTS } from "@/components/ai/QuickPrompts";
import { useAIFocus } from "@/lib/aiFocusStore";
import { OpsUnlockDialog } from "@/components/admin/OpsUnlockDialog";
import { useOpsUnlock, formatCountdown } from "@/hooks/useOpsUnlock";
import { Link } from "react-router-dom";
import { Focus } from "lucide-react";
import React from "react";

const MODE_LABELS: Record<AIMode, string> = {
  explain: "ai.modes.explain",
  summarize: "ai.modes.summarize",
  validate: "ai.modes.validate",
  draft: "ai.modes.draft",
  digest: "ai.modes.digest",
  camp: "ai.modes.camp",
  agent: "ai.modes.agent",
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
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const { profile } = useProfile();
  const { isAIEnabled, isLoading: settingsLoading } = useAISettings(role);
  const { messages, isStreaming, error, sendMessage, cancel, clearChat } = useAIAssistant();
  const isMobile = useIsMobile();
  const focus = useAIFocus();
  const baseQuickPrompts = getQuickPromptsForRole(role);
  // Phase 5: when the user has a booking sheet open, surface booking-focused prompts.
  // Bubble deck: Control Mode gets the ops deck, a focused booking gets booking
  // prompts, otherwise the role default. Set after `mode` below.
  // Display mode: compact / normal / expanded. Remembered per browser.
  const { mode: panelMode, setMode: setPanelMode, cycleMode: cyclePanelMode } = useAIPanelMode();
  const expanded = panelMode === "expanded";
  const isCompact = panelMode === "compact";
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showPrompts, setShowPrompts] = useState(panelMode !== "compact");
  const [mode, setMode] = useState<AIMode>("explain");
  // Ops security-code gate for Control Mode (deep ops).
  const {
    configured: opsCodeConfigured,
    unlocked: opsUnlocked,
    keepAlive: opsKeepAlive,
    msLeft: opsMsLeft,
    lock: opsLock,
  } = useOpsUnlock();
  const opsGateOpen = !opsCodeConfigured || opsUnlocked;
  const [unlockOpen, setUnlockOpen] = useState(false);
  const inControlMode = mode === "agent" && role !== "guest";
  const quickPrompts = inControlMode
    ? CONTROL_MODE_PROMPTS
    : focus && role !== "guest"
      ? FOCUSED_BOOKING_PROMPTS
      : baseQuickPrompts;
  const staffName = (profile.data?.full_name || "").split(" ")[0] || "boss";
  const [language, setLanguage] = useState<string>("en");
  // Optional spoken replies (off by default). When on, each finished assistant
  // reply is read out once; the toggle persists per browser.
  const [speakReplies, setSpeakReplies] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ai.speakReplies") === "1";
  });
  const { state: speechState, speak, stop: stopSpeech } = useSpokenReply((m) => toast.error(m));
  const spokenRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Modes this role may use — guests never see staff tooling.
  const availableModes = (Object.keys(MODE_LABELS) as AIMode[]).filter((m) =>
    role === "guest" ? ["explain", "summarize", "camp"].includes(m) : true,
  );

  // Always keep the active mode chip in view instead of hidden past the fade.
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>(`[data-mode="${mode}"]`);
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [mode, panelMode]);

  // Persist the speaker preference.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ai.speakReplies", speakReplies ? "1" : "0");
    }
  }, [speakReplies]);

  // Read the newest completed assistant reply out loud when the speaker is on.
  useEffect(() => {
    if (!speakReplies || isStreaming) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content.trim()) return;
    const key = `${messages.length}:${last.content.length}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    void speak(last.content, language);
  }, [messages, isStreaming, speakReplies, speak, language]);



  const [bubbleDragging, setBubbleDragging] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Draggable position — used for BOTH bubble and open panel
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => readStoredPos());
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Remember where the panel was dragged to, and never let it end up stranded
  // off-screen after a resize / rotation.
  useEffect(() => {
    writeStoredPos(position);
  }, [position]);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => {
        if (!prev) return prev;
        const el = panelRef.current;
        const size = {
          width: el?.offsetWidth ?? 500,
          height: el?.offsetHeight ?? 600,
        };
        const next = clampPos(prev, size);
        return next.x === prev.x && next.y === prev.y ? prev : next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Restore the default readable layout: normal mode, default corner position.
  const resetLayout = useCallback(() => {
    setPanelMode("normal");
    setPosition(null);
    setShowPrompts(true);
    toast.success("Kru Glitch layout reset");
  }, [setPanelMode]);

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
    setPosition(
      clampPos(
        { x: newX, y: newY },
        {
          width: panelRef.current?.offsetWidth ?? 500,
          height: panelRef.current?.offsetHeight ?? 600,
        },
      ),
    );
  }, []);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Kru Glitch answers in the language the UI is currently in. The selected UI
  // language is the strongest signal; the stored profile preference is the
  // fallback for the first render before i18n has settled.
  useEffect(() => {
    setLanguage(i18n.language || profile.data?.preferred_language || "en");
  }, [i18n.language, profile.data?.preferred_language]);


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
    if (mode === "agent") {
      if (!opsGateOpen) {
        setUnlockOpen(true);
        return;
      }
      void opsKeepAlive();
    }
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

  // Sizing rules:
  //  - phone: bottom sheet (compact = short, normal = tall), expanded = fullscreen
  //  - desktop/laptop: real readable window per display mode, dragged position
  //    honoured for compact/normal, expanded centres itself.
  const draggable = !isMobile && !expanded;
  const panelStyle: React.CSSProperties = draggable && position
    ? { position: "fixed", left: position.x, top: position.y, bottom: "auto", right: "auto", zIndex: 50 }
    : {};

  const mobileClasses = isMobile
    ? expanded
      ? "fixed inset-0 z-50 w-full max-w-full h-[100dvh] rounded-none shadow-2xl"
      : `fixed inset-x-0 bottom-0 z-50 w-full max-w-full rounded-t-2xl rounded-b-none border-b-0 shadow-2xl ${
          isCompact ? "h-[62dvh]" : "h-[90dvh]"
        }`
    : expanded
      ? "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-2xl shadow-2xl w-[min(1100px,calc(100vw-3rem))] h-[calc(100dvh-3rem)]"
      : `${!position ? "fixed bottom-6 right-6" : ""} z-50 rounded-2xl shadow-2xl ${panelBoxClasses(panelMode)}`;

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      onPointerMove={isMobile ? undefined : handlePointerMove}
      onPointerUp={isMobile ? undefined : handlePointerUp}
      className={`${mobileClasses} bg-card border border-border flex flex-col animate-slide-up`}
    >
      {/* Header — primary controls stay visible, everything else lives in the
          overflow menu so nothing crowds or clips at narrow widths. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b">
        <div className="flex min-w-0 items-center gap-1.5">
          {draggable && (
            <div
              className="cursor-grab active:cursor-grabbing p-1.5 -ml-1 rounded hover:bg-accent/50 touch-none"
              onPointerDown={handlePointerDown}
              title="Drag to move"
              aria-label="Drag to move Kru Glitch"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <Swords className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">{t("ai.title")}</span>
          {!isCompact && (
            <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">
              {t("ai.assistOnly")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Control Mode key — the obvious way in. Locked shows the code prompt. */}
          {role !== "guest" && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${inControlMode ? "text-primary" : ""}`}
              title={inControlMode ? "Control Mode is live" : "Enter Control Mode"}
              aria-label={inControlMode ? "Control Mode is live" : "Enter Control Mode"}
              onClick={() => {
                if (inControlMode) return;
                if (!opsGateOpen) setUnlockOpen(true);
                else setMode("agent");
              }}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
          )}
          {speechState === "playing" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              title={t("ai.stopSpeaking", "Stop speaking")}
              aria-label={t("ai.stopSpeaking", "Stop speaking")}
              onClick={stopSpeech}
            >
              <VolumeX className="h-4 w-4" />
            </Button>
          )}
          {/* Size toggle — hops between the current size and expanded. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-pressed={expanded}
            title={expanded ? "Shrink Kru Glitch" : "Expand Kru Glitch"}
            aria-label={expanded ? "Shrink Kru Glitch" : "Expand Kru Glitch"}
            onClick={() => setPanelMode(expanded ? "normal" : "expanded")}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {/* Overflow: size modes, language, speaker, clear, reset layout. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="More options"
                aria-label="More Kru Glitch options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[60] w-52">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Size
              </DropdownMenuLabel>
              {AI_PANEL_MODES.map((m) => (
                <DropdownMenuItem
                  key={m}
                  onClick={() => {
                    setPanelMode(m);
                    if (m === "compact") setShowPrompts(false);
                  }}
                  className={panelMode === m ? "bg-accent" : ""}
                >
                  <Columns2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  {AI_PANEL_MODE_LABELS[m]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("ai.language")}
              </DropdownMenuLabel>
              <div className="max-h-52 overflow-y-auto">
                {LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={language === lang.code ? "bg-accent" : ""}
                  >
                    <Globe className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (speakReplies) stopSpeech();
                  setSpeakReplies((v) => !v);
                }}
              >
                {speechState === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : speakReplies ? (
                  <Volume2 className="h-3.5 w-3.5 mr-2 text-primary" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                )}
                {speakReplies
                  ? t("ai.speakOn", "Spoken replies on")
                  : t("ai.speakOff", "Spoken replies off")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={clearChat}>
                <Trash2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                {t("ai.clearChat")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={resetLayout}>
                <RotateCcw className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Reset layout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={t("common.close", "Close")}
            aria-label={t("common.close", "Close")}
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>


      {/* Mode selector — dropdown when the panel is compact, otherwise a
          scrollable chip row with fade edges so nothing clips or overlaps. */}
      {isCompact ? (
        <div className="px-3 py-2 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-full justify-between text-xs">
                <span className="flex items-center gap-1.5 truncate">
                  {mode === "agent" && !opsGateOpen && <Lock className="h-3 w-3" />}
                  {t(MODE_LABELS[mode])}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[60] w-48">
              {availableModes.map((m) => (
                <DropdownMenuItem
                  key={m}
                  className={mode === m ? "bg-accent" : ""}
                  onClick={() => {
                    if (m === "agent" && !opsGateOpen) {
                      setUnlockOpen(true);
                      return;
                    }
                    setMode(m);
                  }}
                >
                  {m === "agent" && !opsGateOpen && <Lock className="h-3 w-3 mr-2" />}
                  {t(MODE_LABELS[m])}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="relative border-b">
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Assistant mode"
            className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-thin scroll-smooth"
          >
            {availableModes.map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                data-mode={m}
                onClick={() => {
                  // Deep ops sits behind the ops security code. The chip stays
                  // visible so staff know it exists, but tapping it while locked
                  // asks for the code first.
                  if (m === "agent" && !opsGateOpen) {
                    setUnlockOpen(true);
                    return;
                  }
                  setMode(m);
                }}
                className={`text-xs px-3 min-h-[32px] rounded-md whitespace-nowrap transition-all duration-200 inline-flex items-center gap-1 shrink-0 ${
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {m === "agent" && !opsGateOpen && <Lock className="h-3 w-3" />}
                {t(MODE_LABELS[m])}
              </button>
            ))}
          </div>
          {/* Fade hint that there is more to scroll. */}
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-card to-transparent" />
        </div>
      )}


      {/* Control Mode strip — makes the borrowed-authority window visible and
          gives a one-tap way to close it or go review queued drafts. */}
      {inControlMode && (
        <div className="border-b bg-primary/5 px-3 py-1.5 flex items-center gap-2 text-[11px]">
          <Lock className="h-3 w-3 text-primary shrink-0" />
          <span className="font-medium text-foreground shrink-0">Control Mode</span>
          {opsCodeConfigured && opsUnlocked && opsMsLeft > 0 && (
            <span className="text-muted-foreground shrink-0">locks in {formatCountdown(opsMsLeft)}</span>
          )}
          {!opsCodeConfigured && (
            <span className="text-muted-foreground truncate">no security code set</span>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Link to="/ops-console" className="text-primary hover:underline">
              Review drafts
            </Link>
            {opsCodeConfigured && opsUnlocked && (
              <button
                onClick={() => {
                  void opsLock();
                  setMode("explain");
                }}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                Lock now
              </button>
            )}
          </div>
        </div>
      )}

      <OpsUnlockDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        surface="Control Mode"
        onUnlocked={() => setMode("agent")}
      />

      {/* Focus chip — shows what booking Kru Glitch is grounded to */}
      {focus && role !== "guest" && (
        <div className="border-b bg-primary/5">
          <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Focus className="h-3 w-3 text-primary shrink-0" />
            <span className="shrink-0 font-medium text-foreground">Focused on:</span>
            <span className="truncate">{focus.label || `Booking ${focus.bookingId.slice(0, 8)}`}</span>
          </div>
        </div>
      )}



      {/* Messages — single vertical scroller, roomier text in bigger modes */}
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin ${
          isCompact ? "text-[13px] leading-relaxed" : "text-sm leading-[1.65]"
        } ${expanded ? "md:text-[15px]" : ""}`}
      >
        <div
          className={`px-4 py-4 space-y-5 ${
            expanded ? "mx-auto w-full max-w-3xl md:px-8 md:py-6 md:space-y-6" : ""
          }`}
        >
          {messages.length === 0 && (
            <div className="py-4 animate-fade-up">
              {inControlMode ? (
                <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    Code accepted — welcome back, {staffName}.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {opsCodeConfigured && opsMsLeft > 0
                      ? `Control Mode is live for ${formatCountdown(opsMsLeft)}. `
                      : "Control Mode is live. "}
                    Ask me anything, or tap one below. Reads happen right away; anything that changes
                    data comes back as a draft for approval.
                  </p>
                </div>
              ) : (
                <div className="text-center mb-4">
                  <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("ai.welcomeMessage")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("ai.disclaimer")}</p>
                </div>
              )}

              {quickPrompts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                    {inControlMode ? "Control Mode actions" : "Try asking"}
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
                    {/* Read any single reply out loud on demand, even with the
                        auto-speaker off. */}
                    {!(i === messages.length - 1 && isStreaming) && !!msg.content.trim() && (
                      <button
                        onClick={() => (speechState === "playing" ? stopSpeech() : void speak(msg.content, language))}
                        className="ml-3 mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                        aria-label={t("ai.readAloud", "Read aloud")}
                      >
                        <Volume2 className="h-3 w-3" />
                        {t("ai.readAloud", "Read aloud")}
                      </button>
                    )}

                    {/* Deep ops mode: show what the agent actually read, and
                        flag any action it queued for approval. Nothing here has
                        been executed — drafts wait for a human. */}
                    {!!msg.toolsUsed?.length && (
                      <div className="ml-3 mt-1.5 flex flex-wrap gap-1">
                        {Array.from(new Set(msg.toolsUsed)).map((tool) => (
                          <span
                            key={tool}
                            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tool.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    {!!msg.draftIds?.length && (
                      <div className="ml-3 mt-1.5 flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <Link to="/ops-console" className="hover:underline">
                          {msg.draftIds.length === 1
                            ? "1 action drafted — approve it in the Ops Console"
                            : `${msg.draftIds.length} actions drafted — approve them in the Ops Console`}
                        </Link>
                      </div>
                    )}
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
            <div className="space-y-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 animate-shake-subtle">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              {/* Never dead-end. Give the answer to the most common admin asks
                  even when the AI call itself failed. */}
              <div className="text-xs text-foreground/80 border-t border-destructive/20 pt-2 space-y-1">
                <p className="font-medium">While I'm down, here's the short version:</p>
                <p>
                  <strong>Remove a maintenance block:</strong> Calendar → click the striped
                  red block on the room → “Mark resolved” or “Remove block”. The room becomes
                  bookable again right away.
                </p>
                <p>
                  <strong>A booking isn't blocking the calendar:</strong> open the booking and
                  check it's assigned to a specific room and not cancelled.
                </p>
                <p>If it still won't behave, ping an admin — nothing is lost, just stuck.</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Persistent quick actions — sticky, always visible, thumb-friendly */}
      {quickPrompts.length > 0 && (
        <div className="border-t bg-muted/40 sticky bottom-0 z-10 shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.08)]">
          <button
            onClick={() => setShowPrompts((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors min-h-[36px]"
            aria-expanded={showPrompts}
            aria-controls="ai-quick-prompts"
          >
            <span className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-primary" />
              {focus && role !== "guest" ? "Booking actions & help" : "Quick actions & help"}
              <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] normal-case tracking-normal">
                {quickPrompts.length}
              </span>
            </span>
            {showPrompts ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          {showPrompts && (
            <div
              id="ai-quick-prompts"
              className="px-2 pb-2 flex gap-1.5 overflow-x-auto scrollbar-thin snap-x"
            >
              {quickPrompts.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt, mode, undefined, langCodeToName(language))}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 rounded-full bg-background border border-border px-3 py-2 text-[12px] font-medium whitespace-nowrap hover:bg-accent hover:border-primary/40 active:scale-95 disabled:opacity-50 transition-all shrink-0 snap-start min-h-[36px]"
                >
                  <span className="text-primary">{qp.icon}</span>
                  {qp.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Input */}
      <div className="border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">

        <div className={`flex gap-2 ${expanded ? "mx-auto w-full max-w-3xl" : ""}`}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ai.inputPlaceholder")}
            className={`resize-none ${expanded ? "min-h-[56px] max-h-[160px] text-[15px]" : "min-h-[40px] max-h-[80px] text-sm"}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          <VoiceInputButton
            language={language}
            disabled={isStreaming}
            onTranscript={(text) =>
              setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
            }
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
