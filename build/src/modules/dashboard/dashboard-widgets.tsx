import { type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Stat card ──────────────────────────────────────────────────────────────────
export function SummaryCard({
  title, value, hint, icon, trend, trendLabel, accent = "blue",
}: {
  title: string; value: string; hint?: string;
  icon?: ReactNode; trend?: number; trendLabel?: string;
  accent?: "blue" | "emerald" | "amber" | "rose" | "violet" | "cyan";
  tone?: string; // legacy compat – ignored
}) {
  const accentMap = {
    blue:    { bar: "from-blue-400 to-blue-600",       bg: "bg-blue-50 dark:bg-blue-900/20",       text: "text-blue-600 dark:text-blue-400",   glow: "shadow-blue-100"   },
    emerald: { bar: "from-emerald-400 to-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", glow: "shadow-emerald-100" },
    amber:   { bar: "from-amber-400 to-amber-600",     bg: "bg-amber-50 dark:bg-amber-900/20",     text: "text-amber-600 dark:text-amber-400",  glow: "shadow-amber-100"  },
    rose:    { bar: "from-rose-400 to-rose-600",       bg: "bg-rose-50 dark:bg-rose-900/20",       text: "text-rose-600 dark:text-rose-400",    glow: "shadow-rose-100"   },
    violet:  { bar: "from-violet-400 to-violet-600",   bg: "bg-violet-50 dark:bg-violet-900/20",   text: "text-violet-600 dark:text-violet-400",glow: "shadow-violet-100" },
    cyan:    { bar: "from-cyan-400 to-cyan-600",       bg: "bg-cyan-50 dark:bg-cyan-900/20",       text: "text-cyan-600 dark:text-cyan-400",    glow: "shadow-cyan-100"   },
  };
  const a = accentMap[accent];
  const up = trend !== undefined && trend >= 0;

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
      a.glow
    )}>
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${a.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{title}</p>
          <p className="mt-2 truncate text-3xl font-bold tracking-tight text-[var(--text)]">{value}</p>
          {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
          {trend !== undefined && (
            <div className={`mt-2 flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
              {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {Math.abs(trend)}% {trendLabel ?? "vs last month"}
            </div>
          )}
        </div>
        {icon && (
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${a.bg}`}>
            <span className={a.text}>{icon}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chart card wrapper ─────────────────────────────────────────────────────────
export function ChartCard({
  title, subtitle, children, className, action,
}: {
  title: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ── Table widget ───────────────────────────────────────────────────────────────
export function TableWidget({
  title, headers, rows, className,
}: {
  title: string; headers: string[]; rows: ReactNode[][]; className?: string;
}) {
  return (
    <div className={cn("flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm", className)}>
      <h3 className="mb-4 text-sm font-bold text-[var(--text)]">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--background)]">
              {headers.map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={headers.length} className="py-8 text-center text-xs text-[var(--muted)]">No data available</td></tr>
              : rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border)]/50 transition last:border-0 hover:bg-[var(--background)]">
                  {row.map((cell, j) => <td key={j} className="px-3 py-3 text-[var(--text)]">{cell}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Activity feed ──────────────────────────────────────────────────────────────
export function ActivityFeed({
  title, items,
}: {
  title: string;
  items: Array<{ id: string | number; label: string; description: string; time?: string; status?: string }>;
}) {
  const statusColor: Record<string, string> = {
    open:      "bg-amber-100 text-amber-700",
    completed: "bg-emerald-100 text-emerald-700",
    pending:   "bg-blue-100 text-blue-700",
  };

  return (
    <ChartCard title={title}>
      {items.length === 0
        ? <p className="py-8 text-center text-xs text-[var(--muted)]">No items to show</p>
        : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text)]">{item.label}</p>
                  <p className="text-xs text-[var(--muted)]">{item.description}</p>
                  {item.time && <p className="mt-1 text-xs text-[var(--muted)]">{item.time}</p>}
                </div>
                {item.status && (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusColor[item.status] ?? "bg-[var(--primary)]/10 text-[var(--primary)]"}`}>
                    {item.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
    </ChartCard>
  );
}

// ── Attendance widget ──────────────────────────────────────────────────────────
export function AttendanceWidget({
  title, today, recent,
}: {
  title: string;
  today: { status: string; check_in?: string | null; check_out?: string | null; date?: string } | null;
  recent: Array<{ date: string; status: string; check_in?: string | null; check_out?: string | null }>;
}) {
  function statusColor(s: string) {
    if (s === "present") return "bg-emerald-100 text-emerald-700";
    if (s === "late")    return "bg-amber-100 text-amber-700";
    if (s === "absent")  return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-600";
  }

  function statusDot(s: string) {
    if (s === "present") return "bg-emerald-500";
    if (s === "late")    return "bg-amber-500";
    if (s === "absent")  return "bg-rose-500";
    return "bg-slate-400";
  }

  return (
    <ChartCard title={title} subtitle="Current day status and recent history">
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Date",      value: today?.date ?? "—" },
          { label: "Check In",  value: today?.check_in?.slice(11, 16) ?? "—" },
          { label: "Check Out", value: today?.check_out?.slice(11, 16) ?? "—" },
        ].map(box => (
          <div key={box.label} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{box.label}</p>
            <p className="mt-1.5 text-sm font-bold text-[var(--text)]">{box.value}</p>
          </div>
        ))}
      </div>

      {/* Mini calendar-style week strips */}
      {recent.length > 0 && (
        <div className="mb-4 flex gap-1.5">
          {recent.slice(0, 7).map(item => (
            <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
              <div className={`h-8 w-full rounded-lg ${statusDot(item.status)} opacity-70`} title={`${item.date}: ${item.status}`} />
              <p className="text-[9px] text-[var(--muted)]">{item.date.slice(8)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--background)]">
            <tr>
              {["Date", "Status", "In / Out"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent.length === 0
              ? <tr><td colSpan={3} className="px-3 py-8 text-center text-xs text-[var(--muted)]">No attendance history</td></tr>
              : recent.map(item => (
                <tr key={item.date} className="border-t border-[var(--border)] hover:bg-[var(--background)]">
                  <td className="px-3 py-2.5 text-[var(--text)]">{item.date}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusColor(item.status)}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(item.status)}`} />
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted)]">
                    {item.check_in?.slice(11, 16) ?? "—"} / {item.check_out?.slice(11, 16) ?? "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

// ── Announcement widget ────────────────────────────────────────────────────────
export function AnnouncementWidget({
  title, announcements,
}: {
  title: string;
  announcements: Array<{ id: number; title: string; body: string; published_at: string; target: string }>;
}) {
  const targetColor: Record<string, string> = {
    all:        "bg-blue-100 text-blue-700",
    management: "bg-violet-100 text-violet-700",
    employee:   "bg-emerald-100 text-emerald-700",
  };

  return (
    <ChartCard title={title}>
      {announcements.length === 0
        ? <p className="py-8 text-center text-xs text-[var(--muted)]">No announcements</p>
        : (
          <div className="space-y-3">
            {announcements.map(item => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${targetColor[item.target] ?? "bg-slate-100 text-slate-600"}`}>
                    {item.target}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{item.body}</p>
                <p className="mt-2 text-[10px] text-[var(--muted)]">{item.published_at}</p>
              </div>
            ))}
          </div>
        )}
    </ChartCard>
  );
}

// ── Notification widget ────────────────────────────────────────────────────────
export function NotificationWidget({
  title, notifications,
}: {
  title: string;
  notifications: Array<{ id: number; title: string; message: string; type: string; is_read: boolean; created_at: string }>;
}) {
  return (
    <ChartCard title={title}>
      {notifications.length === 0
        ? <p className="py-8 text-center text-xs text-[var(--muted)]">No notifications</p>
        : (
          <div className="space-y-2">
            {notifications.map(item => (
              <div key={item.id}
                className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                  item.is_read
                    ? "border-[var(--border)] bg-[var(--background)]"
                    : "border-[var(--primary)]/25 bg-[var(--primary)]/5"
                }`}
              >
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.is_read ? "bg-[var(--border)]" : "bg-[var(--primary)]"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text)]">{item.title}</p>
                  <p className="text-xs text-[var(--muted)]">{item.message}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{item.created_at}</p>
                </div>
                {!item.is_read && (
                  <span className="shrink-0 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
                )}
              </div>
            ))}
          </div>
        )}
    </ChartCard>
  );
}