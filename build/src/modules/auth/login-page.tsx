import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { login } from "@/services/auth-service";
import { useAuthStore } from "@/store/auth-store";

export function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const session = await login(email, password);
      setSession(session.token, session.user);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/20 bg-[color-mix(in_srgb,var(--card)_88%,transparent)] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.18),transparent_28%)]" />
      <div className="relative">
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text)]">Sign in to continue</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Access your HRMS workspace with a clean, secure, modern login experience.
        </p>

        <div className="mt-7 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="email">
              Work email
            </label>
            <FormInput
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              type="email"
              autoComplete="email"
              required
              className="bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text)]" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <FormInput
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="pr-12 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted)] transition hover:text-[var(--text)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

          <Button className="group flex h-12 w-full items-center gap-2 rounded-xl" disabled={loading}>
            <span>{loading ? "Signing in..." : "Sign in"}</span>
            {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
          </Button>

          <p className="text-center text-xs font-medium tracking-wide text-[var(--muted)]">
            Powered by Slingsottech
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 text-sm">
          <Link to="/auth/forgot-password" className="font-medium text-[var(--primary)] transition hover:opacity-80">
            Forgot password?
          </Link>
          <div className="inline-flex items-center gap-2 text-[var(--muted)]">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Encrypted session
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
          <div className="rounded-2xl border border-[var(--border)] bg-white/50 p-3">
            <Zap className="mb-2 h-4 w-4 text-[var(--primary)]" />
            Fast access to your dashboard
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-white/50 p-3">
            <ShieldCheck className="mb-2 h-4 w-4 text-[var(--primary)]" />
            Built for secure workforce sign-in
          </div>
        </div>
      </div>
    </form>
  );
}


