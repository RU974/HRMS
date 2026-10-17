import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import {
  closeAttendanceReopening,
  getAttendanceChangeLog,
  listAttendancePeriods,
  listAttendanceReopenings,
  lockAttendancePeriod,
  reopenAttendancePeriod,
  unlockAttendancePeriod,
  type AttendancePeriod,
} from "@/services/hr-management-service";
import { HistoryEntry, formatDateTime } from "./attendance-history";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Close months for editing, and read the company-wide change log (including deleted records). */
export function AttendancePeriodsPanel() {
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [logPage, setLogPage] = useState(1);

  const periods = useQuery({ queryKey: ["attendance", "periods", year], queryFn: () => listAttendancePeriods(year) });
  // Reopening a month that payroll closed needs payroll access as well (the server checks both).
  const canReopen = useAuthStore(s => s.hasPermission("payroll:manage_settings"));
  const reopenings = useQuery({ queryKey: ["attendance", "reopenings"], queryFn: listAttendanceReopenings, enabled: canReopen });
  const log = useQuery({
    queryKey: ["attendance", "change-log", action, logPage],
    queryFn: () => getAttendanceChangeLog({ page: logPage, action: action || undefined }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["attendance"] });
  const lockMutation = useMutation({
    mutationFn: ({ month, reason }: { month: number; reason: string }) => lockAttendancePeriod(year, month, reason),
    onSuccess: async () => { setError(null); setNotice("Period locked."); await refresh(); },
    onError: (e: Error) => setError(e.message),
  });
  const unlockMutation = useMutation({
    mutationFn: ({ month, reason }: { month: number; reason: string }) => unlockAttendancePeriod(year, month, reason),
    onSuccess: async () => { setError(null); setNotice("Period unlocked."); await refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  const reopenMutation = useMutation({
    mutationFn: reopenAttendancePeriod,
    onSuccess: async () => { setError(null); setNotice("Period reopened. Payroll already run for it is not recalculated automatically."); await refresh(); },
    onError: (e: Error) => setError(e.message),
  });
  const closeReopeningMutation = useMutation({
    mutationFn: closeAttendanceReopening,
    onSuccess: async () => { setError(null); setNotice("Period closed again."); await refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  function reopen(p: AttendancePeriod) {
    const reason = window.prompt(
      `Reopen ${MONTHS[p.month - 1]} ${p.year} for corrections after payroll?\nEveryone in this company is reopened for 24 hours and the change is recorded.\n\nReason (required, at least 5 characters):`,
      ""
    );
    if (reason === null) return;
    if (reason.trim().length < 5) { setError("A reason of at least 5 characters is required to reopen a period."); return; }
    setNotice(null);
    reopenMutation.mutate({ year: p.year, month: p.month, reason: reason.trim(), hours: 24 });
  }

  function lock(p: AttendancePeriod) {
    const reason = window.prompt(`Lock ${MONTHS[p.month - 1]} ${p.year}? Nobody can change its attendance until it is unlocked.\n\nReason (optional):`, "");
    if (reason === null) return;
    setNotice(null);
    lockMutation.mutate({ month: p.month, reason });
  }

  function unlock(p: AttendancePeriod) {
    const reason = window.prompt(`Unlock ${MONTHS[p.month - 1]} ${p.year}? Say why (required, it is recorded):`, "");
    if (reason === null) return;
    if (!reason.trim()) { setError("A reason is required to unlock a period."); return; }
    setNotice(null);
    unlockMutation.mutate({ month: p.month, reason: reason.trim() });
  }

  const entries = log.data?.data ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Period locks</h2>
            <p className="text-sm text-[var(--muted)]">
              A locked month accepts no attendance changes. Payroll also closes a month on its own: once an employee has a payroll record
              (draft or later) for it, their attendance for that month is closed. Delete or cancel that payroll record to reopen it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => setYear(y => y - 1)}>←</Button>
            <span className="min-w-[3rem] text-center text-sm font-semibold tabular-nums">{year}</span>
            <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={year >= thisYear} onClick={() => setYear(y => y + 1)}>→</Button>
          </div>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {notice && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

        {periods.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {periods.isError && <p className="text-sm text-red-600">Could not load the periods.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(periods.data ?? []).map(p => {
            const future = new Date(p.year, p.month - 1, 1) > new Date();
            return (
              <div key={p.month} className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{MONTHS[p.month - 1]}</p>
                  {p.locked
                    ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Locked</span>
                    : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Open</span>}
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-[var(--muted)]">
                  {p.locked && <p>By {p.locked_by?.name ?? "an administrator"}{p.locked_at ? ` · ${formatDateTime(p.locked_at)}` : ""}</p>}
                  {p.locked && p.reason && <p>Reason: {p.reason}</p>}
                  {p.payroll_completed && <p>Payroll run marked completed: closed for everyone.</p>}
                  {p.payroll_records > 0 && <p>{p.payroll_records} payroll record{p.payroll_records === 1 ? "" : "s"}: those employees are closed.</p>}
                </div>
                <div className="mt-2">
                  {p.locked
                    ? <Button variant="outline" className="px-2 py-1 text-xs" disabled={unlockMutation.isPending} onClick={() => unlock(p)}>Unlock</Button>
                    : <Button variant="outline" className="px-2 py-1 text-xs" disabled={future || lockMutation.isPending} onClick={() => lock(p)}>Lock month</Button>}
                  {!p.locked && canReopen && (p.payroll_records > 0 || p.payroll_completed) && (
                    <Button variant="outline" className="ml-2 px-2 py-1 text-xs" disabled={reopenMutation.isPending} onClick={() => reopen(p)}>Reopen for corrections</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {canReopen && (reopenings.data ?? []).length > 0 && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Reopened periods</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">Months reopened after payroll, for the last 30 days. Edits made meanwhile are in the change history.</p>
          <ul className="space-y-2">
            {(reopenings.data ?? []).map(r => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm">
                <div>
                  <p className="font-medium">{MONTHS[r.month - 1]} {r.year} · {r.employee?.name ?? "all employees"}</p>
                  <p className="text-xs text-[var(--muted)]">
                    By {r.opener?.name ?? "an administrator"} · {r.active ? `open until ${formatDateTime(r.expires_at)}` : "closed"} · {r.reason}
                  </p>
                </div>
                {r.active && (
                  <Button variant="outline" className="px-2 py-1 text-xs" disabled={closeReopeningMutation.isPending} onClick={() => closeReopeningMutation.mutate(r.id)}>Close now</Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Change history</h2>
            <p className="text-sm text-[var(--muted)]">Every create, edit and delete of an attendance record, with who made it and why.</p>
          </div>
          <select
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={action}
            onChange={e => { setAction(e.target.value); setLogPage(1); }}
          >
            <option value="">All changes</option>
            <option value="created">Created</option>
            <option value="updated">Edited</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        {log.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {log.isError && <p className="text-sm text-red-600">Could not load the change history.</p>}
        {!log.isLoading && entries.length === 0 && <p className="text-sm text-[var(--muted)]">No changes recorded yet.</p>}
        <ul className="space-y-2">
          {entries.map(entry => <HistoryEntry key={entry.id} entry={entry} showEmployee />)}
        </ul>

        {(log.data?.last_page ?? 1) > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--muted)]">Page {log.data?.current_page} of {log.data?.last_page}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)}>← Prev</Button>
              <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={logPage >= (log.data?.last_page ?? 1)} onClick={() => setLogPage(p => p + 1)}>Next →</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
