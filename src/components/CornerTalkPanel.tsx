import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Swords, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCornerTalk, type Severity } from "@/hooks/useCornerTalk";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "corner-talk-collapsed";

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
  const { role } = useAuth();
  const { data, isLoading, error } = useCornerTalk();

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

  // Also update prevKeys when newKeys animation ends
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

  // Loading state
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

  // Error or no data — silent fail
  if (error || !data) return null;

  const hasUrgent = data.attention.some((a) => a.severity === "urgent");

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
          {data.allClear ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              {t("cornerTalk.allClear", "All clear")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {data.attention.length} {data.attention.length === 1 ? "item" : "items"}
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
          {data.allClear ? (
            <p className="text-sm text-muted-foreground py-1">
              {t("cornerTalk.allOperationsNormal", "All operations running normally")}
            </p>
          ) : (
            <>
              {/* Attention lines */}
              <div className="space-y-1.5">
                {data.attention.map((item, i) => (
                  <button
                    key={`att-${item.messageKey}`}
                    onClick={() =>
                      onAskGlitch?.(`Tell me more about: ${item.text}`)
                    }
                    className={`flex items-start gap-2.5 w-full text-left pl-2 py-1 rounded-sm hover:bg-accent/40 transition-colors ${severityBorderClass(item.severity)} ${
                      newKeys.has(item.messageKey) ? "animate-fade-in" : ""
                    }`}
                  >
                    <SeverityDot severity={item.severity} />
                    <span className={`text-sm leading-snug ${severityTextClass(item.severity)}`}>
                      {item.text}
                    </span>
                  </button>
                ))}
              </div>

              {/* Upcoming */}
              {data.upcoming.length > 0 && (
                <div className="pt-1.5 border-t border-border/60">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("cornerTalk.comingUp", "Coming up")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {data.upcoming.map((item, i) => (
                      <button
                        key={`up-${i}`}
                        onClick={() =>
                          onAskGlitch?.(`Tell me more about: ${item.text}`)
                        }
                        className="flex items-start gap-2.5 w-full text-left pl-2 py-0.5 rounded-sm hover:bg-accent/40 transition-colors"
                      >
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0 mt-1.5" />
                        <span className="text-sm text-muted-foreground leading-snug">
                          {item.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
