import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard, Building2, CalendarDays, BookOpen, DollarSign,
  BarChart3, MessageSquare, Code2, Settings, FileText, User,
  ChevronRight, ChevronLeft, X, Sparkles, Shield, Bot,
  Wrench, CreditCard, Star, Lightbulb, ExternalLink,
} from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTutorial } from "@/hooks/useTutorial";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ── Step metadata ── */

interface StepDef {
  icon: React.ReactNode;
  route?: string;
  category: "gettingStarted" | "operations" | "communication" | "intelligence";
}

const STEP_DEFS: Record<string, StepDef> = {
  yourRole:            { icon: <Shield className="h-7 w-7" />, category: "gettingStarted" },
  dashboard:           { icon: <LayoutDashboard className="h-7 w-7" />, route: "/dashboard", category: "gettingStarted" },
  units:               { icon: <Building2 className="h-7 w-7" />, route: "/units", category: "operations" },
  bookings:            { icon: <BookOpen className="h-7 w-7" />, route: "/bookings", category: "operations" },
  calendar:            { icon: <CalendarDays className="h-7 w-7" />, route: "/calendar", category: "operations" },
  pricing:             { icon: <DollarSign className="h-7 w-7" />, route: "/pricing", category: "operations" },
  reports:             { icon: <BarChart3 className="h-7 w-7" />, route: "/reports", category: "operations" },
  messages:            { icon: <MessageSquare className="h-7 w-7" />, route: "/messages", category: "communication" },
  embeds:              { icon: <Code2 className="h-7 w-7" />, route: "/embeds", category: "communication" },
  settings:            { icon: <Settings className="h-7 w-7" />, route: "/settings", category: "operations" },
  kruGlitch:           { icon: <Bot className="h-7 w-7" />, category: "intelligence" },
  "guest.bookings":    { icon: <BookOpen className="h-7 w-7" />, category: "operations" },
  "guest.messages":    { icon: <MessageSquare className="h-7 w-7" />, category: "communication" },
  "guest.documents":   { icon: <FileText className="h-7 w-7" />, category: "operations" },
  "guest.staySupport": { icon: <Wrench className="h-7 w-7" />, category: "operations" },
  "guest.payments":    { icon: <CreditCard className="h-7 w-7" />, category: "operations" },
  "guest.reviews":     { icon: <Star className="h-7 w-7" />, category: "communication" },
  "guest.profile":     { icon: <User className="h-7 w-7" />, category: "gettingStarted" },
};

const ROLE_STEP_KEYS: Record<AppRole, string[]> = {
  admin: ["yourRole", "dashboard", "units", "bookings", "calendar", "pricing", "reports", "messages", "embeds", "settings", "kruGlitch"],
  manager: ["yourRole", "dashboard", "units", "bookings", "calendar", "pricing", "reports", "messages", "embeds", "settings", "kruGlitch"],
  front_desk_supervisor: ["yourRole", "dashboard", "bookings", "calendar", "messages", "settings", "kruGlitch"],
  front_desk: ["yourRole", "dashboard", "bookings", "calendar", "messages", "settings", "kruGlitch"],
  maintenance: ["yourRole", "dashboard", "calendar", "kruGlitch"],
  viewer: ["yourRole", "dashboard", "bookings", "calendar", "reports"],
  guest: ["yourRole", "guest.bookings", "guest.messages", "guest.documents", "guest.staySupport", "guest.payments", "guest.reviews", "guest.profile", "kruGlitch"],
};

/* ── i18n helpers ── */

function resolvePoint(t: (k: string) => string, stepKey: string, role: AppRole, pointNum: number): string {
  if (stepKey === "yourRole") return t(`tutorial.yourRole.${role}.point${pointNum}`);
  if (stepKey === "kruGlitch") {
    const roleKey = `tutorial.kruGlitch.${role}.point${pointNum}`;
    const val = t(roleKey);
    if (val !== roleKey) return val;
    return t(`tutorial.kruGlitch.point${pointNum}`);
  }
  const roleKey = `tutorial.${stepKey}.${role}.point${pointNum}`;
  const val = t(roleKey);
  if (val !== roleKey) return val;
  return t(`tutorial.${stepKey}.point${pointNum}`);
}

function resolveTitle(t: (k: string) => string, stepKey: string, role: AppRole): string {
  if (stepKey === "yourRole") return t(`tutorial.yourRole.${role}.title`);
  return t(`tutorial.${stepKey}.title`);
}

function resolveProTip(t: (k: string) => string, stepKey: string, role: AppRole): string | null {
  if (stepKey === "yourRole") {
    const key = `tutorial.yourRole.${role}.proTip`;
    const val = t(key);
    return val !== key ? val : null;
  }
  // Try role-specific proTip, then generic
  const roleKey = `tutorial.${stepKey}.${role}.proTip`;
  const roleVal = t(roleKey);
  if (roleVal !== roleKey) return roleVal;
  const genericKey = `tutorial.${stepKey}.proTip`;
  const genericVal = t(genericKey);
  return genericVal !== genericKey ? genericVal : null;
}

/* ── Category colors ── */
const CATEGORY_STYLES: Record<string, string> = {
  gettingStarted: "bg-primary/10 text-primary",
  operations: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  communication: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  intelligence: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

/* ── Progress Dots ── */
function ProgressDots({ total, current, onDotClick }: { total: number; current: number; onDotClick: (i: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-2">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          onClick={() => onDotClick(i)}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            i === current ? "w-6 bg-primary" : i < current ? "w-2 bg-primary/40" : "w-2 bg-muted-foreground/20"
          )}
        />
      ))}
    </div>
  );
}

/* ── Main Component ── */

interface TutorialOverlayProps {
  variant: "staff" | "guest";
}

export function TutorialOverlay({ variant }: TutorialOverlayProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showTutorial, completeTutorial } = useTutorial();
  const { role } = useAuth();
  const [currentStep, setCurrentStep] = useState(-1);

  const effectiveRole: AppRole = variant === "guest" ? "guest" : (role ?? "viewer");
  const stepKeys = ROLE_STEP_KEYS[effectiveRole];
  const totalSteps = stepKeys.length;

  if (!showTutorial) return null;

  const isWelcome = currentStep === -1;
  const isLastStep = currentStep === totalSteps - 1;
  const stepKey = isWelcome ? null : stepKeys[currentStep];
  const stepDef = stepKey ? STEP_DEFS[stepKey] : null;
  const progress = isWelcome ? 0 : ((currentStep + 1) / totalSteps) * 100;
  const proTip = stepKey ? resolveProTip(t, stepKey, effectiveRole) : null;
  const categoryKey = stepDef?.category ?? "gettingStarted";

  const handleNext = () => {
    if (isLastStep) completeTutorial();
    else setCurrentStep((s) => s + 1);
  };
  const handleBack = () => setCurrentStep((s) => Math.max(-1, s - 1));
  const handleSkip = () => completeTutorial();
  const handleGoThere = () => {
    if (stepDef?.route) {
      completeTutorial();
      navigate(stepDef.route);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg p-0 gap-0 overflow-hidden border-primary/20 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header bar */}
        <div className="bg-primary/5 border-b border-border px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">
              {isWelcome ? t("tutorial.welcome") : t("tutorial.stepOf", { current: currentStep + 1, total: totalSteps })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector compact className="w-[52px] h-7 px-2 text-xs bg-background border-border z-[60]" />
            <Button variant="ghost" size="sm" onClick={handleSkip} className="h-7 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3 mr-1" />
              {t("tutorial.skip")}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 min-h-[260px] flex flex-col items-center text-center">
          {isWelcome ? (
            <div className="animate-fade-up">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">{t("tutorial.welcome")}</h2>
              <p className="text-xs text-muted-foreground/70 mb-3">{t("tutorial.welcomeSubtitle")}</p>
              <p className="text-muted-foreground text-sm max-w-sm mb-4">{t("tutorial.letsGetStarted")}</p>
              <Badge variant="secondary" className="text-xs">
                {t("tutorial.roleBadge", { role: t(`roles.${effectiveRole}`) })}
              </Badge>
              <div className="mt-5 text-xs text-muted-foreground/60">
                {totalSteps} {totalSteps === 1 ? "step" : "steps"} personalized for your role
              </div>
            </div>
          ) : stepKey && stepDef ? (
            <div key={currentStep} className="animate-fade-up w-full">
              {/* Category badge */}
              <div className="flex justify-center mb-3">
                <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full", CATEGORY_STYLES[categoryKey])}>
                  {t(`tutorial.category.${categoryKey}`)}
                </span>
              </div>

              {/* Icon + Title */}
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 mx-auto text-primary">
                {stepDef.icon}
              </div>
              <h2 className="text-lg font-bold text-foreground mb-3">
                {resolveTitle(t, stepKey, effectiveRole)}
              </h2>

              {/* Points */}
              <ul className="text-sm text-muted-foreground space-y-2 text-left max-w-sm mx-auto">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="text-primary mt-0.5 shrink-0">•</span>
                    <span>{resolvePoint(t, stepKey, effectiveRole, n)}</span>
                  </li>
                ))}
              </ul>

              {/* Pro Tip */}
              {proTip && (
                <div className="mt-4 mx-auto max-w-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-3.5 py-2.5 flex gap-2 items-start text-left">
                  <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">{proTip}</span>
                </div>
              )}

              {/* Go There button */}
              {stepDef.route && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGoThere}
                  className="mt-4 text-xs gap-1.5"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("tutorial.goThere")}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 space-y-2">
          <Progress value={progress} className="h-1" />
          {!isWelcome && (
            <ProgressDots total={totalSteps} current={currentStep} onDotClick={setCurrentStep} />
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={isWelcome}
              className="text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("tutorial.back")}
            </Button>
            <Button size="sm" onClick={handleNext}>
              {isWelcome ? t("tutorial.next") : isLastStep ? t("tutorial.finish") : t("tutorial.next")}
              {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
