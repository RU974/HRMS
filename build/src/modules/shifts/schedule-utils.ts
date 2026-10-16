import type { ScheduleCell } from "@/services/shift-schedule-service";

/** Local calendar date as YYYY-MM-DD (avoids the UTC shift of toISOString). */
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const parseIsoDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (iso: string, days: number) => {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
};

/** Monday of the week containing the date. */
export const startOfWeek = (iso: string) => {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toIsoDate(d);
};

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const formatDay = (iso: string) => {
  const d = parseIsoDate(iso);
  return { weekday: WEEKDAY_SHORT[d.getDay()], day: d.getDate(), month: d.toLocaleString(undefined, { month: "short" }) };
};

export const formatLongDate = (iso: string) =>
  parseIsoDate(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const SOURCE_LABEL: Record<ScheduleCell["source"], string> = {
  default: "Default shift",
  roster: "Roster",
  rotation: "Rotation",
  override: "One-off change",
  swap: "Swap",
  none: "No shift"
};

/** Cell tone: off days are muted, changed days stand out so a planner sees what is not the usual pattern. */
export const cellClass = (cell: ScheduleCell) => {
  if (cell.on_leave) return "bg-amber-500/15 text-amber-600";
  if (!cell.working) return "bg-[var(--bg)] text-[var(--muted)]";
  if (cell.source === "swap") return "bg-fuchsia-500/15 text-fuchsia-600";
  if (cell.source === "override") return "bg-sky-500/15 text-sky-600";
  if (cell.source === "rotation" || cell.source === "roster") return "bg-emerald-500/15 text-emerald-600";
  return "bg-[var(--card)] text-[var(--text)]";
};

export const cellLabel = (cell: ScheduleCell) => {
  if (cell.on_leave) return "Leave";
  if (!cell.working) return "Off";
  return cell.name ?? "Work";
};

export const SWAP_STATUS_LABEL: Record<string, string> = {
  pending_peer: "Waiting for colleague",
  pending_approval: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled"
};
