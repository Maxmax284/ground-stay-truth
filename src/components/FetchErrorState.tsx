import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FetchErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/**
 * Reusable error state for data fetching failures.
 * Visually distinct from empty states.
 */
export function FetchErrorState({
  message = "Unable to load data",
  onRetry,
}: FetchErrorStateProps) {
  return (
    <div className="text-center py-16 space-y-4">
      <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
      <p className="text-foreground font-medium">{message}</p>
      <p className="text-sm text-muted-foreground">
        Something went wrong. Please try again.
      </p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      ) : (
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Reload Page
        </Button>
      )}
    </div>
  );
}
