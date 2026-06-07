import { useEffect, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────
export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

// ── Global store (no external dep needed) ────────────────
type Listener = (toasts: Toast[]) => void;

class ToastStore {
  private toasts: Toast[] = [];
  private listeners: Listener[] = [];

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l([...this.toasts]));
  }

  add(toast: Omit<Toast, "id">) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.toasts = [...this.toasts, { ...toast, id }];
    this.emit();

    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
    return id;
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  clear() {
    this.toasts = [];
    this.emit();
  }
}

export const toastStore = new ToastStore();

// ── Public API ────────────────────────────────────────────
export const toast = {
  success: (title: string, message?: string, duration?: number) =>
    toastStore.add({ type: "success", title, message, duration }),
  error: (title: string, message?: string, duration?: number) =>
    toastStore.add({ type: "error", title, message, duration: duration ?? 6000 }),
  warning: (title: string, message?: string, duration?: number) =>
    toastStore.add({ type: "warning", title, message, duration }),
  info: (title: string, message?: string, duration?: number) =>
    toastStore.add({ type: "info", title, message, duration }),
};

// ── Style config ──────────────────────────────────────────
const TOAST_STYLES: Record<ToastType, { bar: string; icon: string; label: string }> = {
  success: {
    bar: "bg-emerald-500",
    icon: "✓",
    label: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    bar: "bg-red-500",
    icon: "✕",
    label: "text-red-600 dark:text-red-400",
  },
  warning: {
    bar: "bg-amber-500",
    icon: "⚠",
    label: "text-amber-600 dark:text-amber-400",
  },
  info: {
    bar: "bg-blue-500",
    icon: "ℹ",
    label: "text-blue-600 dark:text-blue-400",
  },
};

// ── Single toast item ─────────────────────────────────────
function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const style = TOAST_STYLES[t.type];

  useEffect(() => {
    // Mount → slide in
    const enter = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(enter);
  }, []);

  function dismiss() {
    setLeaving(true);
    setTimeout(onDismiss, 300);
  }

  return (
    <div
      role="alert"
      className="group relative flex w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg transition-all duration-300"
      style={{
        transform: visible && !leaving ? "translateX(0)" : "translateX(calc(100% + 1rem))",
        opacity: visible && !leaving ? 1 : 0,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {/* Left colour bar */}
      <div className={`w-1 shrink-0 ${style.bar}`} />

      {/* Content */}
      <div className="flex flex-1 items-start gap-3 p-4">
        <span className={`mt-0.5 text-sm font-bold ${style.label}`}>{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text)] leading-tight">{t.title}</p>
          {t.message && (
            <p className="mt-0.5 text-xs text-[var(--muted)] leading-relaxed">{t.message}</p>
          )}
        </div>
        <button
          onClick={dismiss}
          className="ml-1 shrink-0 rounded-lg p-1 text-[var(--muted)] opacity-0 transition hover:bg-[var(--border)]/50 hover:text-[var(--text)] group-hover:opacity-100"
          aria-label="Dismiss"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Auto-dismiss progress bar */}
      {(t.duration ?? 4000) > 0 && (
        <div
          className={`absolute bottom-0 left-1 right-0 h-0.5 origin-left ${style.bar} opacity-30`}
          style={{
            animation: `shrink ${t.duration ?? 4000}ms linear forwards`,
          }}
        />
      )}

      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}

// ── Toast container (mount in app root) ──────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const sync = useCallback((updated: Toast[]) => setToasts(updated), []);

  useEffect(() => toastStore.subscribe(sync), [sync]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed right-4 top-20 z-[9999] flex flex-col gap-2"
      style={{ maxWidth: "min(calc(100vw - 2rem), 380px)" }}
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => toastStore.remove(t.id)}
        />
      ))}
    </div>
  );
}