import React from "react";

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The page failed to load. Please refresh, or head back to the home page.
          </p>
          {this.state.error?.message && (
            <p className="text-xs text-muted-foreground/70 font-mono break-words">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Refresh
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded border border-border text-sm font-medium hover:bg-muted"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
