import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Swords, ChevronDown, ChevronUp, Clock, CheckCircle2, EyeOff, Undo2, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCornerTalk, type Severity } from "@/hooks/useCornerTalk";
import { useAuth } from "@/hooks/useAuth";
import { useSoundEffects } from "@/hooks/useSoundEffects";

const STORAGE_KEY = "corner-talk-collapsed";
const SOFT_DISMISSED_PREFIX = "corner-talk-soft-";
const HARD_DISMISSED_PREFIX = "corner-talk-hard-";

function getStoredSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}
function saveStoredSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

interface CornerTalkPanelProps {
  onAskGlitch?: (question: string) => void;
}

function SeverityDot({ severity, dimmed }: { severity: Severity; dimmed?: boolean }) {
  if (dimmed) return <span className="h-2 w-2 rounded-full bg-muted-foreground/20 shrink-0" />;
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

  type CornerTalkAnimMode = "stagger" | "pulse" | "refresh";
  const [ctAnimMode, setCtAnimMode] = useState<CornerTalkAnimMode>(() => {
    try {
      const s = localStorage.getItem("corner-talk-anim-mode");
      if (s === "stagger" || s === "pulse" || s === "refresh") return s;
    } catch {}
    return "stagger";
  });

  useEffect(() => {
    const handler = () => {
      try {
        const s = localStorage.getItem("corner-talk-anim-mode");
        if (s === "stagger" || s === "pulse" || s === "refresh") setCtAnimMode(s);
      } catch {}
    };
    window.addEventListener("corner-talk-anim-changed", handler);
    return () => window.removeEventListener("corner-talk-anim-changed", handler);
  }, []);

  /** Get animation class for an item at a given index */
  const getItemAnimClass = useCallback((index: number, severity: string) => {
    if (ctAnimMode === "stagger") {
      return `animate-fade-in [animation-delay:${index * 100}ms] [animation-fill-mode:both]`;
    }
    if (ctAnimMode === "pulse" && (severity === "urgent" || severity === "attention")) {
      return severity === "urgent"
        ? "animate-[pulse_3s_ease-in-out_infinite] shadow-[0_0_8px_hsl(var(--destructive)/0.3)]"
        : "animate-[pulse_4s_ease-in-out_infinite] shadow-[0_0_6px_hsl(var(--primary)/0.2)]";
    }
    if (ctAnimMode === "refresh") {
      return "transition-all duration-500 ease-out";
    }
    return "";
  }, [ctAnimMode]);

  const softKey = `${SOFT_DISMISSED_PREFIX}${userId}`;
  const hardKey = `${HARD_DISMISSED_PREFIX}${userId}`;

  const [softDismissed, setSoftDismissed] = useState<Set<string>>(() => getStoredSet(softKey));
  const [hardDismissed, setHardDismissed] = useState<Set<string>>(() => getStoredSet(hardKey));

  // Reload when user changes
  useEffect(() => {
    if (userId) {
      setSoftDismissed(getStoredSet(`${SOFT_DISMISSED_PREFIX}${userId}`));
      setHardDismissed(getStoredSet(`${HARD_DISMISSED_PREFIX}${userId}`));
    }
  }, [userId]);

  // Clean stale keys when data changes
  useEffect(() => {
    if (!data || !userId) return;
    const currentKeys = new Set([
      ...data.attention.map((a) => a.messageKey),
      ...data.upcoming.map((u) => u.messageKey),
    ]);
    setSoftDismissed((prev) => {
      const cleaned = new Set([...prev].filter((k) => currentKeys.has(k)));
      if (cleaned.size !== prev.size) saveStoredSet(`${SOFT_DISMISSED_PREFIX}${userId}`, cleaned);
      return cleaned;
    });
    setHardDismissed((prev) => {
      const cleaned = new Set([...prev].filter((k) => currentKeys.has(k)));
      if (cleaned.size !== prev.size) saveStoredSet(`${HARD_DISMISSED_PREFIX}${userId}`, cleaned);
      return cleaned;
    });
  }, [data, userId]);

  const softDismiss = useCallback((key: string) => {
    if (!userId) return;
    setSoftDismissed((prev) => {
      const next = new Set(prev); next.add(key);
      saveStoredSet(`${SOFT_DISMISSED_PREFIX}${userId}`, next);
      return next;
    });
  }, [userId]);

  const undoDismiss = useCallback((key: string) => {
    if (!userId) return;
    setSoftDismissed((prev) => {
      const next = new Set(prev); next.delete(key);
      saveStoredSet(`${SOFT_DISMISSED_PREFIX}${userId}`, next);
      return next;
    });
  }, [userId]);

  const hardDismiss = useCallback((key: string) => {
    if (!userId) return;
    // Remove from soft, add to hard
    setSoftDismissed((prev) => {
      const next = new Set(prev); next.delete(key);
      saveStoredSet(`${SOFT_DISMISSED_PREFIX}${userId}`, next);
      return next;
    });
    setHardDismissed((prev) => {
      const next = new Set(prev); next.add(key);
      saveStoredSet(`${HARD_DISMISSED_PREFIX}${userId}`, next);
      return next;
    });
  }, [userId]);

  // Sound on first load
  useEffect(() => {
    if (data && !briefingPlayedRef.current) {
      briefingPlayedRef.current = true;
      playSound("briefing");
    }
  }, [data, playSound]);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  const prevKeysRef = useRef<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data?.attention) return;
    const currentKeys = new Set(data.attention.map((a) => a.messageKey));
    const fresh = new Set<string>();
    currentKeys.forEach((k) => { if (!prevKeysRef.current.has(k)) fresh.add(k); });
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

  // Categorize: active, soft-dismissed (greyed), hard-dismissed (hidden)
  const activeAttention = data.attention.filter((a) => !softDismissed.has(a.messageKey) && !hardDismissed.has(a.messageKey));
  const greyedAttention = data.attention.filter((a) => softDismissed.has(a.messageKey));
  const activeUpcoming = data.upcoming.filter((u) => !softDismissed.has(u.messageKey) && !hardDismissed.has(u.messageKey));
  const greyedUpcoming = data.upcoming.filter((u) => softDismissed.has(u.messageKey));

  const hasUrgent = activeAttention.some((a) => a.severity === "urgent");
  const totalActive = activeAttention.length + activeUpcoming.length;
  const totalGreyed = greyedAttention.length + greyedUpcoming.length;
  const effectiveAllClear = data.allClear || (totalActive === 0 && totalGreyed === 0);

  return (
    <Card className={`animate-fade-in transition-all duration-200 ${hasUrgent ? "ring-1 ring-destructive/20" : ""}`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-accent/30 rounded-t-[var(--radius)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Swords className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">Corner Talk</span>
          {effectiveAllClear ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              {t("cornerTalk.allClear", "All clear")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {totalActive} {totalActive === 1 ? "item" : "items"}
              {totalGreyed > 0 && ` · ${totalGreyed} read`}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Body */}
      {!collapsed && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {effectiveAllClear ? (
            <p className="text-sm text-muted-foreground py-1">
              {t("cornerTalk.allOperationsNormal", "All operations running normally")}
            </p>
          ) : (
            <>
              {/* Active attention items */}
              {activeAttention.length > 0 && (
                <div className="space-y-1.5">
                  {activeAttention.map((item, idx) => (
                    <div
                      key={`att-${item.messageKey}`}
                      className={`flex items-center gap-1 w-full pl-2 py-1 rounded-sm ${severityBorderClass(item.severity)} ${getItemAnimClass(idx, item.severity)} ${newKeys.has(item.messageKey) ? "animate-fade-in" : ""}`}
                    >
                      <button
                        onClick={() => onAskGlitch?.(`Tell me more about: ${item.text}`)}
                        className="flex items-start gap-2.5 flex-1 text-left hover:bg-accent/40 rounded-sm transition-colors py-0.5 px-1 -ml-1 min-w-0"
                      >
                        <SeverityDot severity={item.severity} />
                        <span className={`text-sm leading-snug ${severityTextClass(item.severity)}`}>{item.text}</span>
                      </button>
                      <button
                        onClick={() => softDismiss(item.messageKey)}
                        className="p-1.5 rounded hover:bg-accent/60 shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        title={t("cornerTalk.markRead", "Mark as read")}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Active upcoming */}
              {activeUpcoming.length > 0 && (
                <div className="pt-1.5 border-t border-border/60">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("cornerTalk.comingUp", "Coming up")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {activeUpcoming.map((item) => (
                      <div key={`up-${item.messageKey}`} className="flex items-center gap-1 w-full">
                        <button
                          onClick={() => onAskGlitch?.(`Tell me more about: ${item.text}`)}
                          className="flex items-start gap-2.5 flex-1 text-left pl-2 py-0.5 rounded-sm hover:bg-accent/40 transition-colors min-w-0"
                        >
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0 mt-1.5" />
                          <span className="text-sm text-muted-foreground leading-snug">{item.text}</span>
                        </button>
                        <button
                          onClick={() => softDismiss(item.messageKey)}
                          className="p-1.5 rounded hover:bg-accent/60 shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          title={t("cornerTalk.markRead", "Mark as read")}
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Greyed-out (soft dismissed) section */}
              {totalGreyed > 0 && (
                <div className="pt-2 border-t border-border/40 space-y-1">
                  <span className="text-xs text-muted-foreground/50 uppercase tracking-wide">
                    {t("cornerTalk.readItems", "Read")}
                  </span>
                  {greyedAttention.map((item) => (
                    <div
                      key={`grey-att-${item.messageKey}`}
                      className="flex items-center gap-1 w-full pl-2 py-0.5 rounded-sm opacity-50"
                    >
                      <button
                        onClick={() => onAskGlitch?.(`Tell me more about: ${item.text}`)}
                        className="flex items-start gap-2.5 flex-1 text-left hover:bg-accent/40 rounded-sm transition-colors py-0.5 px-1 -ml-1 min-w-0"
                      >
                        <SeverityDot severity={item.severity} dimmed />
                        <span className="text-sm leading-snug text-muted-foreground line-through decoration-muted-foreground/30">{item.text}</span>
                      </button>
                      <button
                        onClick={() => undoDismiss(item.messageKey)}
                        className="p-1.5 rounded hover:bg-accent/60 shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
                        title={t("cornerTalk.undoRead", "Mark unread")}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="p-1.5 rounded hover:bg-destructive/10 shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors"
                            title={t("cornerTalk.removeForGood", "Remove for good")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("cornerTalk.confirmRemoveTitle", "Remove this alert?")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("cornerTalk.confirmRemoveDesc", "This will permanently hide this alert for you. It won't come back unless new data triggers it.")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => hardDismiss(item.messageKey)}>{t("cornerTalk.removeForGood", "Remove for good")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                  {greyedUpcoming.map((item) => (
                    <div
                      key={`grey-up-${item.messageKey}`}
                      className="flex items-center gap-1 w-full pl-2 py-0.5 rounded-sm opacity-50"
                    >
                      <button
                        onClick={() => onAskGlitch?.(`Tell me more about: ${item.text}`)}
                        className="flex items-start gap-2.5 flex-1 text-left pl-1 py-0.5 rounded-sm hover:bg-accent/40 transition-colors min-w-0"
                      >
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/20 shrink-0 mt-1.5" />
                        <span className="text-sm text-muted-foreground leading-snug line-through decoration-muted-foreground/30">{item.text}</span>
                      </button>
                      <button
                        onClick={() => undoDismiss(item.messageKey)}
                        className="p-1.5 rounded hover:bg-accent/60 shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
                        title={t("cornerTalk.undoRead", "Mark unread")}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="p-1.5 rounded hover:bg-destructive/10 shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors"
                            title={t("cornerTalk.removeForGood", "Remove for good")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("cornerTalk.confirmRemoveTitle", "Remove this alert?")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("cornerTalk.confirmRemoveDesc", "This will permanently hide this alert for you. It won't come back unless new data triggers it.")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => hardDismiss(item.messageKey)}>{t("cornerTalk.removeForGood", "Remove for good")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
