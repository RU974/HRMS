import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/modals/modal";
import { getAttendanceHistory, type AttendanceHistoryEntry } from "@/services/hr-management-service";

const FIELD_LABELS: Record<string, string> = {
  employee_id: "Employee",
  leave_id: "Leave",
  date: "Date",
  check_in: "Check in",
  check_out: "Check out",
  shift_id: "Shift",
  status: "Status",
  status_reason: "Status set by",
  source: "Source",
  biometric_device_id: "Device",
  work_from_home: "Work from home",
  notes: "Notes",
  correction_status: "Correction",
  correction_request_notes: "Correction request",
  correction_proposed_check_in: "Proposed check in",
  correction_proposed_check_out: "Proposed check out",
  correction_response_notes: "Correction reply",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Edited by a person",
  self_service: "Employee self-service",
  import: "CSV import",
  biometric: "Biometric device",
  leave: "Leave sync",
  auto_absent: "Automatic absence / missing punch",
  recalculation: "Status recalculation",
  schedule: "Shift schedule change",
  system: "System",
  repair: "Repair command",
  legacy: "Before history was introduced",
};

export const sourceLabel = (source?: string | null) => (source ? SOURCE_LABELS[source] ?? source : "System");

function formatValue(field: string, value: string | null): string {
  if (value === null || value === "") return "—";
  if (field === "work_from_home") return value === "1" ? "Yes" : "No";
  if (field === "check_in" || field === "check_out") return value.replace("T", " ").slice(0, 16);
  return value.replace(/_/g, " ");
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/** Who changed it: the person's name, else what ran. */
export function actorLabel(entry: Pick<AttendanceHistoryEntry, "actor" | "source">): string {
  return entry.actor?.name ?? sourceLabel(entry.source);
}

export function HistoryEntry({ entry, showEmployee = false }: { entry: AttendanceHistoryEntry; showEmployee?: boolean }) {
  const fields = Object.entries(entry.changes ?? {});
  return (
    <li className="rounded-xl border border-[var(--border)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium capitalize">
          {entry.action}
          {showEmployee && <span className="ml-2 font-normal normal-case text-[var(--muted)]">{entry.employee?.name ?? `Employee #${entry.employee_id}`} · {entry.date.slice(0, 10)}</span>}
        </p>
        <p className="text-xs text-[var(--muted)]">{formatDateTime(entry.created_at)}</p>
      </div>
      <p className="text-xs text-[var(--muted)]">
        By {actorLabel(entry)}{entry.actor ? ` · ${sourceLabel(entry.source)}` : ""}
      </p>
      {entry.reason && <p className="mt-1 text-xs">Reason: {entry.reason}</p>}
      {fields.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {fields.map(([field, [from, to]]) => (
            <li key={field}>
              <span className="font-medium">{FIELD_LABELS[field] ?? field}:</span>{" "}
              {entry.action === "created" ? formatValue(field, to)
                : entry.action === "deleted" ? formatValue(field, from)
                : <>{formatValue(field, from)} <span className="text-[var(--muted)]">→</span> {formatValue(field, to)}</>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function AttendanceHistoryModal({ attendanceId, title, onClose }: { attendanceId: number; title: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["attendance", "history", attendanceId],
    queryFn: () => getAttendanceHistory(attendanceId),
  });

  return (
    <Modal title={`History · ${title}`} onClose={onClose}>
      {query.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
      {query.isError && <p className="text-sm text-red-600">Could not load the history.</p>}
      {query.data && query.data.length === 0 && <p className="text-sm text-[var(--muted)]">No changes were recorded for this record.</p>}
      {query.data && query.data.length > 0 && (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {query.data.map(entry => <HistoryEntry key={entry.id} entry={entry} />)}
        </ul>
      )}
    </Modal>
  );
}
