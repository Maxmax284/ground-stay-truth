import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Swords, ChevronDown, ChevronUp, Clock, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCornerTalk, type Severity } from "@/hooks/useCornerTalk";
import { useAuth } from "@/hooks/useAuth";
import { useSoundEffects } from "@/hooks/useSoundEffects";

const STORAGE_KEY = "corner-talk-collapsed";
const DISMISSED_KEY_PREFIX = "corner-talk-dismissed-";

function getDismissedKey(userId: string) {
  return `${DISMISSED_KEY_PREFIX}${userId}`;
}

function getDismissedSet(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getDismissedKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveDismissedSet(userId: string, set: Set<string>) {
  try {
    localStorage.setItem(getDismissedKey(userId), JSON.stringify([...set]));
  } catch {}
}

interface CornerTalkPanelProps {
  onAskGlitch?: (question: string) => void;
}

function SeverityDot({ severity }: { severity: Severity }) {
  if (severity === "urgent") {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-[ping_1s_ease-in-out_1] absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
      </span>
    );
  }
  if (severity === "attention") {
    return <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />;
  }
  return <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />;
}

function severityTextClass(severity: Severity): string {
  if (severity === "urgent") return "text-destructive font-medium";
  if (severity === "attention") return "text-amber-700 dark:text-amber-400";
  return "text-muted-foreground";
}

function severityBorderClass(severity: Severity): string {
  if (severity === "urgent") return "border-l-2 border-destructive";
  if (severity === "attention") return "border-l-2 border-amber-500 dark:border-amber-400";
  return "";
}

export function CornerTalkPanel({ onAskGlitch }: CornerTalkPanelProps) {
  const { t } = useTranslation();
  const { role, user } = useAuth();
  const { data, isLoading, error } = useCornerTalk();
  const { play: playSound } = useSoundEffects();
  const briefingPlayedRef = useRef(false);
  const userId = user?.id ?? "";

  // Per-user dismissed state
  const [dismissed, setDismissed] = useState<Set<string>>(() => getDismissedSet(userId));

  // Re-load dismissed set when user changes
  useEffect(() => {
    if (userId) setDismissed(getDismissedSet(userId));
  }, [userId]);

  // Clean up dismissed keys that no longer exist in current data
  useEffect(() => {
    if (!data || !userId) return;
    const currentKeys = new Set([
      ...data.attention.map((a) => a.messageKey),
      ...data.upcoming.map((u) => u.messageKey),
    ]);
    setDismissed((prev) => {
      const cleaned = new Set([...prev].filter((k) => currentKeys.has(k)));
      if (cleaned.size !== prev.size) {
        saveDismissedSet(userId, cleaned);
      }
      return cleaned;
    });
  }, [data, userId]);

  const dismissItem = useCallback(
    (messageKey: string) => {
      if (!userId) return;
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(messageKey);
        saveDismissedSet(userId, next);
        return next;
      });
    },
    [userId]
  );

  // Play briefing sound when data loads for the first time
  useEffect(() => {
    if (data && !briefingPlayedRef.current) {
      briefingPlayedRef.current = true;
      playSound("briefing");
    }
  }, [data, playSound]);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  // Track previous attention keys to detect new items
  const prevKeysRef = useRef<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data?.attention) return;
    const currentKeys = new Set(data.attention.map((a) => a.messageKey));
    const fresh = new Set<string>();
    currentKeys.forEach((k) => {
      if (!prevKeysRef.current.has(k)) fresh.add(k);
    });
    if (fresh.size > 0 && prevKeysRef.current.size > 0) {
      setNewKeys(fresh);
      const timer = setTimeout(() => setNewKeys(new Set()), 1500);
      return () => clearTimeout(timer);
    }
    prevKeysRef.current = currentKeys;
  }, [data?.attention]);

  useEffect(() => {
    if (newKeys.size === 0 && data?.attention) {
      prevKeysRef.current = new Set(data.attention.map((a) => a.messageKey));
    }
  }, [newKeys, data?.attention]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch {}
  }, [collapsed]);

  // Don't render for guests or if no role
  if (!role || role === "guest") return null;

  if (isLoading) {
    return (
      <Card className="animate-fade-in">
        <div className="flex items-center gap-3 px-4 py-3">
          <Swords className="h-4 w-4 text-primary shrink-0" />
          <Skeleton className="h-4 w-32" />
        </div>
      </Card>
    );
  }

  if (error || !data) return null;

  const activeAttention = data.attention.filter((a) => !dismissed.has(a.messageKey));
  const dismissedAttention = data.attention.filter((a) => dismissed.has(a.messageKey));
  const activeUpcoming = data.upcoming.filter((u) => !dismissed.has(u.messageKey));
  const dismissedUpcoming = data.upcoming.filter((u) => dismissed.has(u.messageKey));
  const totalDismissed = dismissedAttention.length + dismissedUpcoming.length;
  const hasUrgent = activeAttention.some((a) => a.severity === "urgent");
  const effectiveAllClear = data.allClear || (activeAttention.length === 0 && activeUpcoming.length === 0);

  return (
    <Card
      className={`animate-fade-in transition-all duration-200 ${
        hasUrgent ? "ring-1 ring-destructive/20" : ""
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-accent/30 rounded-t-[var(--radius)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Swords className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            Corner Talk
          </span>
          {effectiveAllClear ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              {t("cornerTalk.allClear", "All clear")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {activeAttention.length + activeUpcoming.length}{" "}
              {activeAttention.length + activeUpcoming.length === 1 ? "item" : "items"}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Body — collapsible */}
      {!collapsed && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {effectiveAllClear ? (
            <p className="text-sm text-muted-foreground py-1">
              {t("cornerTalk.allOperationsNormal", "All operations running normally")}
            </p>
          ) : (
            <>
              {/* Attention lines */}
              {activeAttention.length > 0 && (
                <div className="space-y-1.5">
                  {activeAttention.map((item) => (
                    <div
                      key={`att-${item.messageKey}`}
                      className={`flex items-start gap-2 w-full pl-2 py-1 rounded-sm group ${severityBorderClass(item.severity)} ${
                        newKeys.has(item.messageKey) ? "animate-fade-in" : ""
                      }`}
                    >
                      <button
                        onClick={() => onAskGlitch?.(`Tell me more about: ${item.text}`)}
                        className="flex items-start gap-2.5 flex-1 text-left hover:bg-accent/40 rounded-sm transition-colors py-0.5 px-1 -ml-1"
                      >
                        <SeverityDot severity={item.severity} />
                        <span className={`text-sm leading-snug ${severityTextClass(item.severity)}`}>
                          {item.text}
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissItem(item.messageKey);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent/60 shrink-0"
                        title={t("cornerTalk.markRead", "Mark as read")}
                      >
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upcoming */}
              {activeUpcoming.length > 0 && (
                <div className="pt-1.5 border-t border-border/60">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("cornerTalk.comingUp", "Coming up")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {activeUpcoming.map((item, i) => (
                      <div
                        key={`up-${item.messageKey}`}
                        className="flex items-start gap-2 w-full group"
                      >
                        <button
                          onClick={() => onAskGlitch?.(`Tell me more about: ${item.text}`)}
                          className="flex items-start gap-2.5 flex-1 text-left pl-2 py-0.5 rounded-sm hover:bg-accent/40 transition-colors"
                        >
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0 mt-1.5" />
                          <span className="text-sm text-muted-foreground leading-snug">
                            {item.text}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissItem(item.messageKey);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent/60 shrink-0"
                          title={t("cornerTalk.markRead", "Mark as read")}
                        >
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Dismissed count */}
          {totalDismissed > 0 && (
            <div className="pt-1.5 border-t border-border/40">
              <button
                onClick={() => {
                  if (!userId) return;
                  setDismissed(new Set());
                  saveDismissedSet(userId, new Set());
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors w-full"
              >
                <Eye className="h-3 w-3" />
                <span>
                  {totalDismissed} {t("cornerTalk.dismissed", "read")} — {t("cornerTalk.showAgain", "show again")}
                </span>
              </button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
