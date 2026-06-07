import { Link, useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-6 text-center">
      {/* Decorative number */}
      <div
        className="select-none font-black leading-none"
        style={{
          fontSize: "clamp(6rem, 20vw, 12rem)",
          background: "linear-gradient(135deg, var(--primary) 0%, var(--accent, #06b6d4) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          opacity: 0.15,
        }}
      >
        404
      </div>

      {/* Content */}
      <div className="-mt-8 space-y-4">
        <h1 className="text-2xl font-bold text-[var(--text)]">Page not found</h1>
        <p className="mx-auto max-w-sm text-sm text-[var(--muted)]">
          The page you are looking for doesn't exist, was moved, or you don't have permission to access it.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--border)]/40"
          >
            ← Go back
          </button>
          <Link
            to="/dashboard"
            className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      {/* Subtle grid decoration */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
    </div>
  );
}