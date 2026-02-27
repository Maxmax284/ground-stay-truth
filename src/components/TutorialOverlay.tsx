import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard, Building2, CalendarDays, BookOpen, DollarSign,
  BarChart3, MessageSquare, Code2, Settings, FileText, User,
  ChevronRight, ChevronLeft, X, Sparkles, Shield, Bot,
  Wrench, CreditCard, Star,
} from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTutorial } from "@/hooks/useTutorial";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";

interface TutorialStep {
  key: string;
  icon: React.ReactNode;
}

// ── Role-specific step sets ──

const STEP_DEFS: Record<string, { icon: React.ReactNode }> = {
  yourRole:           { icon: <Shield className="h-8 w-8" /> },
  dashboard:          { icon: <LayoutDashboard className="h-8 w-8" /> },
  units:              { icon: <Building2 className="h-8 w-8" /> },
  bookings:           { icon: <BookOpen className="h-8 w-8" /> },
  calendar:           { icon: <CalendarDays className="h-8 w-8" /> },
  pricing:            { icon: <DollarSign className="h-8 w-8" /> },
  reports:            { icon: <BarChart3 className="h-8 w-8" /> },
  messages:           { icon: <MessageSquare className="h-8 w-8" /> },
  embeds:             { icon: <Code2 className="h-8 w-8" /> },
  settings:           { icon: <Settings className="h-8 w-8" /> },
  kruGlitch:          { icon: <Bot className="h-8 w-8" /> },
  "guest.bookings":   { icon: <BookOpen className="h-8 w-8" /> },
  "guest.messages":   { icon: <MessageSquare className="h-8 w-8" /> },
  "guest.documents":  { icon: <FileText className="h-8 w-8" /> },
  "guest.staySupport":{ icon: <Wrench className="h-8 w-8" /> },
  "guest.payments":   { icon: <CreditCard className="h-8 w-8" /> },
  "guest.reviews":    { icon: <Star className="h-8 w-8" /> },
  "guest.profile":    { icon: <User className="h-8 w-8" /> },
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

function buildSteps(role: AppRole): TutorialStep[] {
  return ROLE_STEP_KEYS[role].map((key) => ({
    key,
    icon: STEP_DEFS[key]?.icon ?? <Sparkles className="h-8 w-8" />,
  }));
}

/** Resolve i18n key with role-specific override: tutorial.{step}.{role}.pointN → tutorial.{step}.pointN */
function resolvePoint(t: (k: string) => string, stepKey: string, role: AppRole, pointNum: number): string {
  // For yourRole, always use role-specific keys
  if (stepKey === "yourRole") {
    return t(`tutorial.yourRole.${role}.point${pointNum}`);
  }
  // For kruGlitch, try role-specific first
  if (stepKey === "kruGlitch") {
    const roleKey = `tutorial.kruGlitch.${role}.point${pointNum}`;
    const val = t(roleKey);
    if (val !== roleKey) return val;
    return t(`tutorial.kruGlitch.point${pointNum}`);
  }
  // For regular steps, try tutorial.{step}.{role}.pointN first
  const roleKey = `tutorial.${stepKey}.${role}.point${pointNum}`;
  const val = t(roleKey);
  if (val !== roleKey) return val;
  return t(`tutorial.${stepKey}.point${pointNum}`);
}

function resolveTitle(t: (k: string) => string, stepKey: string, role: AppRole): string {
  if (stepKey === "yourRole") {
    return t(`tutorial.yourRole.${role}.title`);
  }
  return t(`tutorial.${stepKey}.title`);
}

interface TutorialOverlayProps {
  variant: "staff" | "guest";
}

export function TutorialOverlay({ variant }: TutorialOverlayProps) {
  const { t } = useTranslation();
  const { showTutorial, completeTutorial } = useTutorial();
  const { role } = useAuth();
  const [currentStep, setCurrentStep] = useState(-1);

  const effectiveRole: AppRole = variant === "guest" ? "guest" : (role ?? "viewer");
  const steps = buildSteps(effectiveRole);

  if (!showTutorial) return null;

  const isWelcome = currentStep === -1;
  const isLastStep = currentStep === steps.length - 1;
  const step = isWelcome ? null : steps[currentStep];
  const progress = isWelcome ? 0 : ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (isLastStep) {
      completeTutorial();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => setCurrentStep((s) => Math.max(-1, s - 1));
  const handleSkip = () => completeTutorial();

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg p-0 gap-0 overflow-hidden border-primary/20 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header bar */}
        <div className="bg-primary/5 border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">
              {isWelcome ? t("tutorial.welcome") : t("tutorial.stepOf", { current: currentStep + 1, total: steps.length })}
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
        <div className="px-6 py-8 min-h-[220px] flex flex-col items-center text-center">
          {isWelcome ? (
            <>
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">{t("tutorial.welcome")}</h2>
              <p className="text-muted-foreground text-sm max-w-sm mb-3">{t("tutorial.letsGetStarted")}</p>
              <Badge variant="secondary" className="text-xs">
                {t("tutorial.roleBadge", { role: t(`roles.${effectiveRole}`) })}
              </Badge>
            </>
          ) : step ? (
            <>
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
                {step.icon}
              </div>
              <h2 className="text-lg font-bold text-foreground mb-3">
                {resolveTitle(t, step.key, effectiveRole)}
              </h2>
              <ul className="text-sm text-muted-foreground space-y-2 text-left max-w-sm">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{resolvePoint(t, step.key, effectiveRole, n)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 space-y-3">
          <Progress value={progress} className="h-1" />
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
