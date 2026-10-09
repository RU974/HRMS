import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError, reloadOnceForNewDeploy } from "@/utils/chunk-reload";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // In production you'd send this to Sentry/LogRocket etc.
    console.error("[ErrorBoundary]", error, errorInfo);
    if (isChunkLoadError(error)) reloadOnceForNewDeploy();
  }

  handleReset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = "/dashboard";
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const { error } = this.state;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-8">
        <div className="w-full max-w-lg">
          {/* Decorative top bar */}
          <div
            className="mb-8 h-1 w-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #ef4444, #f97316, #ef4444)",
            }}
          />

          <div className="space-y-6 rounded-2xl border border-red-200/60 bg-[var(--card)] p-8 shadow-xl dark:border-red-900/30">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-2xl dark:bg-red-950/40">
                ⚠️
              </div>
              <div>
                <h1 className="text-lg font-bold text-[var(--text)]">Something went wrong</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  An unexpected error occurred. Our team has been notified. You can try refreshing or going back to the dashboard.
                </p>
              </div>
            </div>

            {/* Error detail (collapsible) */}
            {error && (
              <details className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Error details
                </summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-red-600 dark:text-red-400">
                  {error.message}
                  {"\n\n"}
                  {error.stack?.slice(0, 600)}
                </pre>
              </details>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => this.handleReset()}
                className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                ← Back to dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--border)]/40"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}