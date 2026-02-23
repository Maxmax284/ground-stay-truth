import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard, Building2, CalendarDays, BookOpen, DollarSign,
  BarChart3, MessageSquare, Code2, Settings, FileText, User,
  ChevronRight, ChevronLeft, X, Sparkles,
} from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTutorial } from "@/hooks/useTutorial";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute } from "@/lib/permissions";

interface TutorialStep {
  key: string;
  icon: React.ReactNode;
  route?: string;
}

const STAFF_STEPS: TutorialStep[] = [
  { key: "dashboard", icon: <LayoutDashboard className="h-8 w-8" />, route: "/dashboard" },
  { key: "units", icon: <Building2 className="h-8 w-8" />, route: "/units" },
  { key: "bookings", icon: <BookOpen className="h-8 w-8" />, route: "/bookings" },
  { key: "calendar", icon: <CalendarDays className="h-8 w-8" />, route: "/calendar" },
  { key: "pricing", icon: <DollarSign className="h-8 w-8" />, route: "/pricing" },
  { key: "reports", icon: <BarChart3 className="h-8 w-8" />, route: "/reports" },
  { key: "messages", icon: <MessageSquare className="h-8 w-8" />, route: "/messages" },
  { key: "embeds", icon: <Code2 className="h-8 w-8" />, route: "/embeds" },
  { key: "settings", icon: <Settings className="h-8 w-8" />, route: "/settings" },
];

const GUEST_STEPS: TutorialStep[] = [
  { key: "guest.bookings", icon: <BookOpen className="h-8 w-8" /> },
  { key: "guest.messages", icon: <MessageSquare className="h-8 w-8" /> },
  { key: "guest.documents", icon: <FileText className="h-8 w-8" /> },
  { key: "guest.profile", icon: <User className="h-8 w-8" /> },
];

interface TutorialOverlayProps {
  variant: "staff" | "guest";
}

export function TutorialOverlay({ variant }: TutorialOverlayProps) {
  const { t } = useTranslation();
  const { showTutorial, completeTutorial } = useTutorial();
  const { role } = useAuth();
  const [currentStep, setCurrentStep] = useState(-1); // -1 = welcome screen

  const allSteps = variant === "guest" ? GUEST_STEPS : STAFF_STEPS;
  const steps = variant === "guest"
    ? allSteps
    : allSteps.filter((s) => s.route && canAccessRoute(role, s.route));

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
              <p className="text-muted-foreground text-sm max-w-sm">{t("tutorial.letsGetStarted")}</p>
            </>
          ) : step ? (
            <>
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
                {step.icon}
              </div>
              <h2 className="text-lg font-bold text-foreground mb-3">{t(`tutorial.${step.key}.title`)}</h2>
              <ul className="text-sm text-muted-foreground space-y-2 text-left max-w-sm">
                <li className="flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t(`tutorial.${step.key}.point1`)}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t(`tutorial.${step.key}.point2`)}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t(`tutorial.${step.key}.point3`)}</span>
                </li>
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
