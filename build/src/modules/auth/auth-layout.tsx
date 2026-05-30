import { Outlet } from "react-router-dom";
import { CheckCircle2, LockKeyhole, Cpu } from "lucide-react";

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_0.95fr]">
      <div className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.28),transparent_30%),linear-gradient(135deg,#081120_0%,#0b1b34_45%,#123a6f_100%)] p-10 text-white lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(99,102,241,0.24),transparent_18%),radial-gradient(circle_at_20%_80%,rgba(34,211,238,0.16),transparent_20%)]" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="max-w-xl">
            <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-200/70">Professional. Secure. Future-ready.</p>
            <h2 className="text-5xl font-black leading-tight tracking-tight">
              A modern workspace built for the way your team works now.
            </h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-200/80">
              Clean access, stronger security, and a polished experience that feels enterprise-grade from the first click.
            </p>
          </div>

          <div className="grid max-w-xl grid-cols-2 gap-4">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <LockKeyhole className="h-5 w-5 text-cyan-300" />
              <p className="mt-3 text-sm font-semibold">Secure authentication</p>
              <p className="mt-2 text-sm text-white/70">Designed for safe, reliable sign-in across your workforce.</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <Cpu className="h-5 w-5 text-cyan-300" />
              <p className="mt-3 text-sm font-semibold">Faster workflows</p>
              <p className="mt-2 text-sm text-white/70">A focused entry point that gets users into the platform quickly.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm text-white/75">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-300" />
            Trusted access layer for your HRMS environment
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <Outlet />
      </div>
    </div>
  );
}


