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

function AIAssistantPanelInner() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { profile } = useProfile();
  const { isAIEnabled, isLoading: settingsLoading } = useAISettings(role);
  const { messages, isStreaming, error, sendMessage, cancel, clearChat } = useAIAssistant();
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AIMode>("explain");
  const [language, setLanguage] = useState<string>("en");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Draggable position
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

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

  const panelStyle: React.CSSProperties = position
    ? { position: "fixed", left: position.x, top: position.y, bottom: "auto", right: "auto", zIndex: 50 }
    : {};

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105 md:bottom-6 bottom-20 animate-pulse-ring"
        aria-label={t("ai.openAssistant")}
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      className={`${!position ? "fixed bottom-6 right-6 md:bottom-6 bottom-20" : ""} z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[min(32rem,calc(100vh-8rem))] animate-slide-up`}
    >
      {/* Header with drag handle */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <div
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-accent/50 touch-none"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            title="Drag to move"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
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

      {/* Mode selector */}
      <div className="flex gap-1 px-3 py-2 border-b overflow-x-auto">
        {(Object.keys(MODE_LABELS) as AIMode[]).map((m) => (
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

      {/* Messages - fixed scroll */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 animate-fade-up">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t("ai.welcomeMessage")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("ai.disclaimer")}</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`text-sm animate-fade-up ${msg.role === "user" ? "ml-8" : "mr-4"}`}>
              <div className={`rounded-lg px-3 py-2 ${
                msg.role === "user"
                  ? "bg-primary/10 text-foreground"
                  : "bg-muted text-foreground"
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="mr-4">
              <div className="bg-muted rounded-lg px-3 py-2">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>·</span>
                </span>
              </div>
            </div>
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
      <div className="border-t px-3 py-2">
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
