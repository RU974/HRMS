import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AttendancePeriodsPanel } from "@/modules/attendance/components/attendance-periods-panel";
import { AttendanceHistoryModal, HistoryEntry, actorLabel } from "@/modules/attendance/components/attendance-history";
import type { AttendanceHistoryEntry, AttendancePeriod } from "@/services/hr-management-service";

// The suite shares a machine with long backend runs; give async queries room.
configure({ asyncUtilTimeout: 8000 });

const service = vi.hoisted(() => ({
  listAttendancePeriods: vi.fn(),
  lockAttendancePeriod: vi.fn(),
  unlockAttendancePeriod: vi.fn(),
  listAttendanceReopenings: vi.fn(),
  reopenAttendancePeriod: vi.fn(),
  closeAttendanceReopening: vi.fn(),
  getAttendanceChangeLog: vi.fn(),
  getAttendanceHistory: vi.fn(),
}));
vi.mock("@/services/hr-management-service", () => service);

let canPayroll = true;
vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { hasPermission: (p: string) => boolean }) => unknown) =>
    selector({ hasPermission: (p: string) => (p === "payroll:manage_settings" ? canPayroll : true) }),
}));
vi.mock("@/components/modals/modal", () => ({
  Modal: ({ title, children }: { title: string; children: React.ReactNode }) => <div role="dialog" aria-label={title}>{children}</div>,
}));

const year = new Date().getFullYear(); // the panel opens on this year; January-April are always in the past

function period(month: number, over: Partial<AttendancePeriod> = {}): AttendancePeriod {
  return { year, month, locked: false, locked_by: null, locked_at: null, reason: null, payroll_completed: false, payroll_records: 0, ...over };
}

function entry(over: Partial<AttendanceHistoryEntry> = {}): AttendanceHistoryEntry {
  return {
    id: 1, attendance_id: 9, employee_id: 3, date: "2026-09-10", action: "updated",
    changes: { check_out: ["2026-09-10 17:00:00", "2026-09-10 18:00:00"], status: ["present", "late"] },
    user_id: 4, source: "manual", reason: "Forgot to punch out", created_at: "2026-09-11T08:00:00Z",
    actor: { id: 4, name: "Ada Admin" }, employee: { id: 3, name: "Lena Lock" }, ...over,
  };
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AttendancePeriodsPanel /></QueryClientProvider>);
}

describe("history entries", () => {
  it("shows who changed what, from and to, and why", () => {
    render(<ul><HistoryEntry entry={entry()} /></ul>);
    expect(screen.getByText(/By Ada Admin/)).toBeInTheDocument();
    expect(screen.getByText(/Reason: Forgot to punch out/)).toBeInTheDocument();
    expect(screen.getByText(/Check out:/).parentElement).toHaveTextContent("2026-09-10 17:00 → 2026-09-10 18:00");
    expect(screen.getByText(/Status:/).parentElement).toHaveTextContent("present → late");
  });

  it("names the job when no person made the change", () => {
    expect(actorLabel({ actor: null, source: "biometric" })).toBe("Biometric device");
    expect(actorLabel({ actor: null, source: "legacy" })).toBe("Before history was introduced");
  });

  it("lists a deleted record's last values", () => {
    render(<ul><HistoryEntry entry={entry({ action: "deleted", changes: { status: ["present", null] } })} showEmployee /></ul>);
    expect(screen.getByText(/Lena Lock/)).toBeInTheDocument();
    expect(screen.getByText(/Status:/).parentElement).toHaveTextContent("present");
  });

  it("modal loads a record's history and handles an empty one", async () => {
    service.getAttendanceHistory.mockResolvedValueOnce([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AttendanceHistoryModal attendanceId={9} title="Lena" onClose={() => {}} /></QueryClientProvider>);
    expect(await screen.findByText(/No changes were recorded/)).toBeInTheDocument();
  });
});

describe("AttendancePeriodsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(service).forEach(fn => fn.mockReset());
    canPayroll = true;
    service.listAttendancePeriods.mockResolvedValue(Array.from({ length: 12 }, (_, i) => period(i + 1)).map(p =>
      p.month === 3 ? period(3, { locked: true, locked_by: { id: 1, name: "Ada Admin" }, reason: "Cut-off" })
        : p.month === 4 ? period(4, { payroll_records: 12 }) : p));
    service.listAttendanceReopenings.mockResolvedValue([]);
    service.getAttendanceChangeLog.mockResolvedValue({ data: [entry()], current_page: 1, last_page: 1, total: 1 });
  });

  it("shows locked, payroll-closed and change-log data", async () => {
    renderPanel();
    expect(await screen.findByText(/Reason: Cut-off/)).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByText(/12 payroll records/)).toBeInTheDocument();
    expect(await screen.findByText(/Reason: Forgot to punch out/)).toBeInTheDocument();
  });

  it("locks a month with a prompted reason", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Payroll cut-off");
    service.lockAttendancePeriod.mockResolvedValue({});
    renderPanel();
    await userEvent.click((await screen.findAllByRole("button", { name: "Lock month" }))[0]);
    await waitFor(() => expect(service.lockAttendancePeriod).toHaveBeenCalledWith(year, 1, "Payroll cut-off"));
  });

  it("does not lock when the prompt is cancelled, and requires a reason to unlock", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValueOnce(null).mockReturnValueOnce("   ");
    renderPanel();
    await userEvent.click((await screen.findAllByRole("button", { name: "Lock month" }))[0]);
    expect(service.lockAttendancePeriod).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole("button", { name: "Unlock" }));
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(service.unlockAttendancePeriod).not.toHaveBeenCalled();
    expect(await screen.findByText(/reason is required to unlock/)).toBeInTheDocument();
  });

  it("offers a reopening only for payroll-closed months, and only with payroll access", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Wrong punch found after payout");
    service.reopenAttendancePeriod.mockResolvedValue({});
    const first = renderPanel();
    const button = await screen.findByRole("button", { name: "Reopen for corrections" });
    expect(screen.getAllByRole("button", { name: "Reopen for corrections" })).toHaveLength(1);
    await userEvent.click(button);
    await waitFor(() => expect(service.reopenAttendancePeriod).toHaveBeenCalled());
    expect(service.reopenAttendancePeriod.mock.calls[0][0]).toEqual({ year, month: 4, reason: "Wrong punch found after payout", hours: 24 });
    first.unmount();

    canPayroll = false;
    service.listAttendanceReopenings.mockClear();
    renderPanel();
    await screen.findByText("Locked");
    expect(screen.queryByRole("button", { name: "Reopen for corrections" })).not.toBeInTheDocument();
    expect(service.listAttendanceReopenings).not.toHaveBeenCalled(); // not fetched without access
  });

  it("lists active reopenings and closes one", async () => {
    service.listAttendanceReopenings.mockResolvedValue([{
      id: 5, employee_id: null, year, month: 4, reason: "Fix payout", opened_at: null, closed_at: null, active: true,
      expires_at: new Date(Date.now() + 3600_000).toISOString(), opener: { id: 1, name: "Ada Admin" }, employee: null,
    }]);
    service.closeAttendanceReopening.mockResolvedValue({});
    renderPanel();
    expect(await screen.findByText(/all employees/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close now" }));
    await waitFor(() => expect(service.closeAttendanceReopening.mock.calls[0][0]).toBe(5));
  });

  it("shows the server's message when locking fails", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("x");
    service.lockAttendancePeriod.mockRejectedValue(new Error("A month that has not started yet cannot be locked."));
    renderPanel();
    await userEvent.click((await screen.findAllByRole("button", { name: "Lock month" }))[0]);
    expect(await screen.findByText(/has not started yet/)).toBeInTheDocument();
  });
});
