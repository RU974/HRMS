import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";

export function SummaryCard({
  title,
  value,
  hint,
  tone = "from-sky-50 to-white",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className={cn("border-white/60 bg-gradient-to-br", tone)}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{value}</p>
      {hint ? <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p> : null}
    </Card>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {children}
    </Card>
  );
}

export function ActivityFeed({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string | number; label: string; description: string; time?: string; status?: string }>;
}) {
  return (
    <Card className="h-full">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <p className="text-sm text-[var(--muted)]">No items to show.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[var(--border)]/70 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">{item.label}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{item.description}</p>
              </div>
              {item.status ? <span className="rounded-full bg-[var(--primary)]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">{item.status}</span> : null}
            </div>
            {item.time ? <p className="mt-2 text-xs text-[var(--muted)]">{item.time}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AttendanceWidget({
  title,
  today,
  recent,
}: {
  title: string;
  today: { status: string; check_in?: string | null; check_out?: string | null; date?: string } | null;
  recent: Array<{ date: string; status: string; check_in?: string | null; check_out?: string | null }>;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Current day status and recent history.</p>
        </div>
        {today ? <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">{today.status}</span> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-white/75 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Date</p>
          <p className="mt-2 text-sm font-medium text-[var(--text)]">{today?.date ?? "No record"}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-white/75 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Check in</p>
          <p className="mt-2 text-sm font-medium text-[var(--text)]">{today?.check_in ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-white/75 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Check out</p>
          <p className="mt-2 text-sm font-medium text-[var(--text)]">{today?.check_out ?? "-"}</p>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-white/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--border)]/30 text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">In / Out</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[var(--muted)]" colSpan={3}>No attendance history.</td>
              </tr>
            ) : null}
            {recent.map((item) => (
              <tr key={item.date} className="border-t border-[var(--border)]/60">
                <td className="px-3 py-2">{item.date}</td>
                <td className="px-3 py-2">{item.status}</td>
                <td className="px-3 py-2">{item.check_in ?? "-"} / {item.check_out ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AnnouncementWidget({
  title,
  announcements,
}: {
  title: string;
  announcements: Array<{ id: number; title: string; body: string; published_at: string; target: string }>;
}) {
  return (
    <Card className="h-full">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <div className="mt-4 space-y-3">
        {announcements.length === 0 ? <p className="text-sm text-[var(--muted)]">No announcements available.</p> : null}
        {announcements.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
            <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{item.body}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{item.published_at}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function NotificationWidget({
  title,
  notifications,
}: {
  title: string;
  notifications: Array<{ id: number; title: string; message: string; type: string; is_read: boolean; created_at: string }>;
}) {
  return (
    <Card className="h-full">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <div className="mt-4 space-y-3">
        {notifications.length === 0 ? <p className="text-sm text-[var(--muted)]">No notifications yet.</p> : null}
        {notifications.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
              <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", item.is_read ? "bg-slate-100 text-slate-500" : "bg-amber-500/10 text-amber-600")}>
                {item.is_read ? "Read" : "Unread"}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{item.message}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{item.created_at}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TableWidget({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <Card className="h-full">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              {headers.map((header) => <th key={header} className="border-b border-[var(--border)] px-3 py-2">{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[var(--muted)]" colSpan={headers.length}>No rows available.</td>
              </tr>
            ) : null}
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-[var(--border)]/60">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
