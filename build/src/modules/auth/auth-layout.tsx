import { Outlet } from "react-router-dom";

const features = [
  "Employee lifecycle management",
  "Automated payroll processing",
  "Real-time attendance & biometrics",
  "Role-based access control",
];

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_0.85fr]">
      {/* ── Left hero panel ── */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:p-14">
        {/* deep background stack */}
        <div className="absolute inset-0 bg-[#07090f]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_0%_0%,rgba(14,116,144,0.30)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(79,70,229,0.32)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_70%)]" />

        {/* very subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.028]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* ambient glow orbs */}
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-[80px]" />
        <div className="absolute bottom-0 right-0 h-[22rem] w-[22rem] rounded-full bg-indigo-600/12 blur-[90px]" />
        <div className="absolute left-[40%] top-[35%] h-48 w-48 rounded-full bg-sky-400/6 blur-[60px]" />

        {/* decorative arc rings */}
        <div
          className="absolute right-[-120px] top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full border border-white/[0.045]"
          style={{ boxShadow: "inset 0 0 60px rgba(56,189,248,0.04)" }}
        />
        <div className="absolute right-[-60px] top-1/2 h-[340px] w-[340px] -translate-y-1/2 rounded-full border border-white/[0.03]" />

        <div className="relative z-10 flex h-full flex-col justify-between">
          {/* hero copy — vertically centred */}
          <div className="my-auto max-w-[500px] py-10">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Enterprise Workforce Platform
            </span>

            <h2 className="mt-4 text-[3.2rem] font-black leading-[1.07] tracking-[-0.02em] text-white">
              HR management,{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(135deg, #7dd3fc 0%, #a78bfa 55%, #67e8f9 100%)",
                }}
              >
                redefined.
              </span>
            </h2>

            <p className="mt-5 text-[15px] leading-[1.85] text-slate-400">
              Streamline payroll, track attendance, manage your workforce, and drive productivity — all from one secure platform.
            </p>

            {/* feature checklist */}
            <div className="mt-9 grid grid-cols-2 gap-x-6 gap-y-4">
              {features.map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500/25 to-indigo-500/25">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="#7dd3fc"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-[13px] text-slate-300/80">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* bottom tagline */}
          <p className="text-[12px] tracking-wide text-slate-600">
            © {new Date().getFullYear()} HRMS · All rights reserved
          </p>
        </div>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6 py-10">
        <Outlet />
      </div>
    </div>
  );
}
