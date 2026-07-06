import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, ShieldCheck, Loader2, Lock, CheckCircle2, XCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { login } from "@/services/auth-service";
import { useAuthStore } from "@/store/auth-store";

type PopupState = { type: "success"; name: string } | { type: "error"; message: string } | null;

export function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [popup, setPopup] = useState<PopupState>(null);

  useEffect(() => {
    if (popup?.type === "success") {
      const t = setTimeout(() => { window.location.href = "/dashboard"; }, 1800);
      return () => clearTimeout(t);
    }
  }, [popup]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPopup(null);
    setLoading(true);

    try {
      const session = await login(email, password);
      setSession(session.token, session.user);
      setPopup({ type: "success", name: session.user?.name ?? "there" });
    } catch (err) {
      setPopup({ type: "error", message: err instanceof Error ? err.message : "Unable to sign in" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      {/* ── toast (slides in from right) ── */}
      <style>{`
        @keyframes toast-in  { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes progress-fill { from { width: 0% } to { width: 100% } }
        .toast-enter { animation: toast-in 0.35s cubic-bezier(0.22,1,0.36,1) forwards; }
      `}</style>

      {popup && (
        <div
          className="toast-enter fixed top-6 right-6 left-6 z-50 w-auto max-w-[320px] sm:left-auto overflow-hidden rounded-2xl border bg-[var(--card)] shadow-2xl"
          style={{
            borderColor: popup.type === "success" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
            boxShadow: popup.type === "success"
              ? "0 8px 32px rgba(34,197,94,0.15), 0 2px 8px rgba(0,0,0,0.12)"
              : "0 8px 32px rgba(239,68,68,0.15), 0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          {/* left accent bar */}
          <div
            className="absolute inset-y-0 left-0 w-[4px]"
            style={{
              backgroundImage: popup.type === "success"
                ? "linear-gradient(180deg,#4ade80,#22c55e)"
                : "linear-gradient(180deg,#f87171,#ef4444)",
            }}
          />

          <div className="flex items-start gap-3 px-5 py-4 pl-6">
            {/* icon */}
            <div
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: popup.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              }}
            >
              {popup.type === "success"
                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" strokeWidth={2} />
                : <XCircle className="h-5 w-5 text-red-500" strokeWidth={2} />}
            </div>

            {/* text */}
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-[var(--text)]">
                {popup.type === "success" ? "Login Successful!" : "Login Failed"}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--muted)]">
                {popup.type === "success"
                  ? <>Welcome back, <span className="font-semibold text-[var(--text)]">{popup.name}</span>. Redirecting…</>
                  : popup.message}
              </p>
              {/* progress bar (success only) */}
              {popup.type === "success" && (
                <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-emerald-500/15">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ animation: "progress-fill 1.8s linear forwards" }}
                  />
                </div>
              )}
            </div>

            {/* close */}
            <button
              onClick={() => setPopup(null)}
              className="ml-1 mt-0.5 shrink-0 rounded-md p-1 text-[var(--muted)] transition-colors hover:bg-[var(--border)] hover:text-[var(--text)]"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── card ── */}
      <div
        className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)]"
        style={{
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.04), 0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 50px -8px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.6) inset",
        }}
      >
        {/* top gradient strip */}
        <div className="h-[3px] w-full" style={{ backgroundImage: "linear-gradient(90deg,#38bdf8,#818cf8,#6366f1)" }} />

        {/* card glow — top-right */}
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-400/[0.07] blur-2xl" />

        <div className="px-8 pt-8 pb-7">
          {/* ── brand ── */}
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="space-y-0.5">
              <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--text)]">Welcome back</h1>
              <p className="text-sm text-[var(--muted)]">Sign in to your workspace</p>
            </div>
          </div>

          {/* ── divider ── */}
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--muted)]/50">
              credentials
            </span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* email */}
            <div className="space-y-1.5">
              <label className="text-[12.5px] font-semibold text-[var(--text)]" htmlFor="email">
                Work email
              </label>
              <FormInput
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            {/* password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12.5px] font-semibold text-[var(--text)]" htmlFor="password">
                  Password
                </label>
                <Link
                  to="/auth/forgot-password"
                  className="text-[11.5px] font-medium text-[var(--primary)] transition-opacity hover:opacity-60"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <FormInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-[15px] w-[15px]" /> : <Eye className="h-[15px] w-[15px]" />}
                </button>
              </div>
            </div>

            {/* CTA */}
            <Button
              className="group relative mt-1 h-[46px] w-full overflow-hidden rounded-xl text-[13.5px] font-semibold text-white transition-all active:scale-[0.98]"
              style={{
                backgroundImage: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15), 0 4px 16px rgba(99,102,241,0.35)",
              }}
              disabled={loading}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 1px 2px rgba(0,0,0,0.15), 0 6px 22px rgba(99,102,241,0.5)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 1px 2px rgba(0,0,0,0.15), 0 4px 16px rgba(99,102,241,0.35)";
              }}
            >
              {/* shimmer overlay */}
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.12)_50%,transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign in
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </Button>
          </form>

          {/* ── trust footer ── */}
          <div className="mt-6 flex items-center justify-center gap-4 border-t border-[var(--border)] pt-5 text-[11.5px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Encrypted session
            </span>
            <span className="h-3 w-px bg-[var(--border)]" />
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-[var(--muted)]" />
              SSL secured
            </span>
          </div>
        </div>
      </div>

      {/* below-card footnote */}
      <p className="mt-5 text-center text-[11.5px] text-[var(--muted)]/50">
        © {new Date().getFullYear()} HRMS-Slingshotteck · All rights reserved
      </p>
    </div>
  );
}
