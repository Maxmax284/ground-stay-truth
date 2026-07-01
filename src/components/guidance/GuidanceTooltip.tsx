/**
 * GuidanceTooltip — wraps children with a shadcn tooltip whose copy comes from
 * the platform_guidance registry. If the entry is missing or the caller's role
 * is not allowed, renders children with no tooltip (fail-soft, never blank UI).
 */
import { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useGuidance } from "@/hooks/useGuidance";

interface Props {
  guidanceKey: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  /** Fallback tooltip text if the entry is missing (dev-only helper). */
  fallback?: string;
}

export function GuidanceTooltip({ guidanceKey, children, side = "top", align = "center", className, fallback }: Props) {
  const { data } = useGuidance(guidanceKey);
  const text = data?.short_tooltip ?? fallback;

  if (!text) return <>{children}</>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align} className={className}>
          <p className="max-w-xs text-xs leading-snug">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
