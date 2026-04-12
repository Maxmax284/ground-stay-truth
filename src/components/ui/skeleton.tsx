import * as React from "react";
import { cn } from "@/lib/utils";

const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-md warm-shimmer", className)} {...props} />
  )
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
