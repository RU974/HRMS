import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getEmployeesPage } from "@/services/employee-service";
import {
  type LeaveItem,
  type LeaveTypeItem,
  type LeaveBalance,
  type LeaveBlackout,
  createLeave,
  createLeaveBlackout,
  createLeaveType,
  deleteLeave,
  deleteLeaveBlackout,
  deleteLeaveType,
  getLeaveBalances,
  getLeaveEncashment,
  getTeamCalendar,
  listLeaveBlackouts,
  listLeaveTypes,
  listLeaves,
  updateLeave,
  updateLeaveType,
} from "@/services/hr-management-service";
import { useAuthStore } from "@/store/auth-store";

// ── Shared ─────────────────────────────────────────────────────────────────────
const selectClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

type LeaveTab = "my-requests" | "pending-approvals" | "all-requests" | "calendar" | "leave-types";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved:  "bg-emerald-50 text-emerald-700",
    pending:   "bg-amber-50 text-amber-700",
    rejected:  "bg-red-50 text-red-700",
    cancelled: "bg-gray-50 text-gray-600",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? "bg-gray-50 text-gray-600"}`}>{status}</span>;
}

// ── Balance widget ─────────────────────────────────────────────────────────────
function BalanceWidget({ employeeId }: { employeeId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["leave-balances", employeeId],
    queryFn:  () => getLeaveBalances(employeeId),
    enabled:  employeeId > 0,
  });
  const balances = (data as LeaveBalance[] | undefined) ?? [];
  const encQ = useQuery({
    queryKey: ["leave-encashment", employeeId],
    queryFn:  () => getLeaveEncashment(employeeId),
    enabled:  employeeId > 0 && balances.some(b => b.leave_type.encashable),
  });
  const enc = encQ.data as { total_encashment?: number } | undefined;

  if (isLoading) return <div className="h-20 animate-pulse rounded-2xl bg-[var(--border)]" />;
  if (!balances.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {balances.map(b => (
          <div key={b.leave_type.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 min-w-[120px]">
            <p className="text-xs font-semibold text-[var(--muted)] truncate">{b.leave_type.name}</p>
            <p className="text-2xl font-bold text-[var(--text)]">{b.remaining_days}</p>
            <p className="text-xs text-[var(--muted)]">of {b.accrued_days + b.carried_forward_days} days</p>
            {b.used_days   > 0 && <p className="text-xs text-red-500">{b.used_days} used</p>}
            {b.pending_days > 0 && <p className="text-xs text-amber-500">{b.pending_days} pending</p>}
            {b.carried_forward_days > 0 && <p className="text-xs text-blue-500">+{b.carried_forward_days} CF</p>}
          </div>
        ))}
        {enc?.total_encashment != null && enc.total_encashment > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 min-w-[120px]">
            <p className="text-xs font-semibold text-emerald-600">Encashment value</p>
            <p className="text-2xl font-bold text-emerald-700">{enc.total_encashment.toLocaleString()}</p>
            <p className="text-xs text-emerald-500">encashable leaves</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team calendar ──────────────────────────────────────────────────────────────
function TeamCalendarView({ leaveTypes }: { leaveTypes: LeaveTypeItem[] }) {
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["leaves-team-calendar", month, year],
    queryFn:  () => getTeamCalendar(month, year),
  });
  const leaves = (data as LeaveItem[] | undefined) ?? [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow    = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0
  const monthLabel  = new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });

  // For each day, find leaves that span it
  function leavesOnDay(day: number): LeaveItem[] {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return leaves.filter(l => l.from_date <= dateStr && l.to_date >= dateStr);
  }

  const typeColorMap: Record<string, string> = {};
  const colors = ["bg-blue-100 text-blue-700","bg-violet-100 text-violet-700","bg-rose-100 text-rose-700","bg-amber-100 text-amber-700","bg-teal-100 text-teal-700"];
  leaveTypes.forEach((t, i) => { typeColorMap[t.name.toLowerCase()] = colors[i % colors.length]; });

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Team Leave Calendar</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="text-xs px-3 py-1.5" onClick={prevMonth}>←</Button>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
          <Button variant="outline" className="text-xs px-3 py-1.5" onClick={nextMonth}>→</Button>
        </div>
      </div>

      {isLoading && <div className="h-64 animate-pulse rounded-xl bg-[var(--border)]" />}

      {!isLoading && (
        <div className="grid grid-cols-7 gap-1">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{d}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`p${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day    = i + 1;
            const onLeave = leavesOnDay(day);
            const isToday = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}` === new Date().toISOString().slice(0,10);
            return (
              <div key={day} className={`min-h-[72px] rounded-xl border p-1.5 ${isToday ? "border-[var(--primary)] ring-1 ring-[var(--primary)]" : "border-[var(--border)]"} ${onLeave.length ? "bg-[var(--background)]" : ""}`}>
                <span className={`block text-xs font-bold ${isToday ? "text-[var(--primary)]" : "text-[var(--muted)]"}`}>{day}</span>
                <div className="mt-0.5 space-y-0.5">
                  {onLeave.slice(0, 3).map(l => (
                    <Link key={l.id} to={`/employees/${l.employee_id}`}
                      className={`block truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight ${typeColorMap[l.type?.toLowerCase()] ?? "bg-gray-100 text-gray-700"} ${l.status === "pending" ? "opacity-60" : ""}`}
                      title={`${l.employee?.name} — ${l.type}${l.status === "pending" ? " (pending)" : ""}`}>
                      {l.employee?.name?.split(" ")[0]}
                    </Link>
                  ))}
                  {onLeave.length > 3 && <p className="text-[9px] text-[var(--muted)] pl-1">+{onLeave.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && leaves.length > 0 && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">This Month</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(leaves.map(l => l.employee?.name))).map(name => (
              <span key={name} className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-0.5 text-xs">{name}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Leave Type modal ───────────────────────────────────────────────────────────
type LeaveTypeFormData = {
  name: string; default_days: number; is_paid: boolean; is_active: boolean;
  accrual_frequency: string; accrual_amount: number;
  carry_forward_days: number; max_balance: number;
  required_approval_levels: number;
  min_request_days: number; max_request_days: number;
  notice_period_days: number; allow_half_day: boolean; encashable: boolean;
};

function LeaveTypeModal({ editing, onClose, onSaved }: { editing: LeaveTypeItem | null; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<LeaveTypeFormData>({
    name:                     editing?.name ?? "",
    default_days:             editing?.default_days ?? 0,
    is_paid:                  editing?.is_paid ?? true,
    is_active:                editing?.is_active ?? true,
    accrual_frequency:        editing?.accrual_frequency ?? "yearly",
    accrual_amount:           editing?.accrual_amount ?? 0,
    carry_forward_days:       editing?.carry_forward_days ?? 0,
    max_balance:              editing?.max_balance ?? 0,
    required_approval_levels: editing?.required_approval_levels ?? 1,
    min_request_days:         editing?.min_request_days ?? 1,
    max_request_days:         editing?.max_request_days ?? 0,
    notice_period_days:       editing?.notice_period_days ?? 0,
    allow_half_day:           editing?.allow_half_day ?? false,
    encashable:               editing?.encashable ?? false,
  });

  const mutation = useMutation({
    mutationFn: () => editing
      ? updateLeaveType(editing.id, form)
      : createLeaveType(form),
    onSuccess: () => onSaved(),
    onError: (e: Error) => setError(e.message),
  });

  const F = <K extends keyof LeaveTypeFormData>(key: K) => ({
    value: form[key] as unknown as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.type === "number" ? Number(e.target.value) : e.target.value;
      setForm(p => ({ ...p, [key]: val }));
    },
  });

  return (
    <Modal title={editing ? `Edit: ${editing.name}` : "New Leave Type"} onClose={onClose}>
      <form className="max-h-[75vh] overflow-y-auto space-y-4 pr-1" onSubmit={e => { e.preventDefault(); setError(null); void mutation.mutateAsync(); }}>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name"><FormInput required {...F("name")} /></FormField>
          <FormField label="Default days / year"><FormInput type="number" min={0} {...F("default_days")} /></FormField>

          <FormField label="Accrual frequency">
            <select className={selectClass} {...F("accrual_frequency")}>
              <option value="none">None (grant up-front)</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </FormField>
          <FormField label="Accrual amount (days)"><FormInput type="number" min={0} {...F("accrual_amount")} /></FormField>

          <FormField label="Carry-forward days"><FormInput type="number" min={0} {...F("carry_forward_days")} /></FormField>
          <FormField label="Max balance (0 = unlimited)"><FormInput type="number" min={0} {...F("max_balance")} /></FormField>

          <FormField label="Approval levels"><FormInput type="number" min={1} max={5} {...F("required_approval_levels")} /></FormField>
          <FormField label="Advance notice (days)"><FormInput type="number" min={0} {...F("notice_period_days")} /></FormField>

          <FormField label="Min days per request"><FormInput type="number" min={0} {...F("min_request_days")} /></FormField>
          <FormField label="Max days per request (0 = unlimited)"><FormInput type="number" min={0} {...F("max_request_days")} /></FormField>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {([["is_paid", "Paid leave"], ["is_active", "Active"], ["allow_half_day", "Allow half-day"], ["encashable", "Encashable"]] as [keyof LeaveTypeFormData, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function LeavesPage() {
  const queryClient     = useQueryClient();
  const user            = useAuthStore(s => s.user);
  const hasApprove      = useAuthStore(s => s.hasPermission("leaves:approve"));
  const hasView         = useAuthStore(s => s.hasPermission("leaves:view"));
  const canCreate       = useAuthStore(s => s.hasPermission("leaves:create"));
  const canManage       = useAuthStore(s => s.hasPermission("leaves:manage_settings"));
  const currentEmpId    = user?.employee?.id ?? 0;

  const [error, setError]           = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<LeaveTab>(
    hasApprove ? "pending-approvals" : hasView ? "all-requests" : canCreate ? "my-requests" : "leave-types"
  );
  const [leaveModal, setLeaveModal] = useState(false);
  const [typeModal, setTypeModal]   = useState(false);
  const [editLeave, setEditLeave]   = useState<LeaveItem | null>(null);
  const [editType, setEditType]     = useState<LeaveTypeItem | null>(null);
  const [rejectModal, setRejectModal]   = useState<LeaveItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [blackoutModal, setBlackoutModal] = useState(false);
  const [blackoutForm, setBlackoutForm]   = useState({ name: "", start_date: "", end_date: "", leave_type_id: "" });
  const [leaveForm, setLeaveForm] = useState({
    employee_id: currentEmpId, type: "", from_date: "", to_date: "", half_day: false, reason: "", status: "pending" as LeaveItem["status"],
  });

  const leaveFilters = useMemo(() => {
    if (activeTab === "my-requests" && currentEmpId) return { employee_id: currentEmpId };
    if (activeTab === "pending-approvals") return { status: "pending" as LeaveItem["status"] };
    return {};
  }, [activeTab, currentEmpId]);

  const leavesQ    = useQuery({ queryKey: ["hr","leaves", leaveFilters], queryFn: () => listLeaves(leaveFilters) });
  const typesQ     = useQuery({ queryKey: ["hr","leave-types"],          queryFn: listLeaveTypes });
  const blackoutsQ = useQuery({ queryKey: ["hr","leave-blackouts"],      queryFn: listLeaveBlackouts, enabled: canManage });
  const employeesQ = useQuery({ queryKey: ["hr","leave-employees"],      queryFn: async () => (await getEmployeesPage({ per_page: 50 })).data ?? [], enabled: hasApprove || canManage });

  const typeOptions = (typesQ.data ?? []).map(t => ({ value: t.name, label: t.name }));
  const leaves = leavesQ.data?.data ?? [];
  const nameMap = new Map((leavesQ.data?.data ?? []).map(l => [l.employee?.id ?? l.employee_id, l.employee?.name ?? `#${l.employee_id}`]));

  const tabs: { key: LeaveTab; label: string; show: boolean }[] = [
    { key: "my-requests",       label: "My Requests",      show: canCreate || hasView || hasApprove },
    { key: "pending-approvals", label: "Pending Approvals",show: hasApprove },
    { key: "all-requests",      label: "All Requests",     show: hasView || hasApprove },
    { key: "calendar",          label: "Calendar",         show: hasApprove || hasView },
    { key: "leave-types",       label: "Leave Types",      show: canManage },
  ];

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => createLeave(leaveForm),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr","leaves"] }); setLeaveModal(false); },
    onError: (e: Error) => setError(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: () => updateLeave(editLeave!.id, { type: leaveForm.type, from_date: leaveForm.from_date, to_date: leaveForm.to_date, half_day: leaveForm.half_day, status: leaveForm.status }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr","leaves"] }); setLeaveModal(false); },
    onError: (e: Error) => setError(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteLeave,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["hr","leaves"] }),
    onError: (e: Error) => setError(e.message),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: LeaveItem["status"]; reason?: string }) =>
      updateLeave(id, { status, reason }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr","leaves"] }); setRejectModal(null); },
    onError: (e: Error) => setError(e.message),
  });
  const deleteTypeMutation = useMutation({
    mutationFn: deleteLeaveType,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["hr","leave-types"] }),
    onError: (e: Error) => setError(e.message),
  });
  const blackoutMutation = useMutation({
    mutationFn: () => createLeaveBlackout({ name: blackoutForm.name, start_date: blackoutForm.start_date, end_date: blackoutForm.end_date, leave_type_id: blackoutForm.leave_type_id ? Number(blackoutForm.leave_type_id) : null }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["hr","leave-blackouts"] }); setBlackoutModal(false); setBlackoutForm({ name:"", start_date:"", end_date:"", leave_type_id:"" }); },
    onError: (e: Error) => setError(e.message),
  });
  const deleteBlackoutMutation = useMutation({
    mutationFn: deleteLeaveBlackout,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["hr","leave-blackouts"] }),
    onError: (e: Error) => setError(e.message),
  });

  function openLeave(leave?: LeaveItem) {
    setEditLeave(leave ?? null);
    setLeaveForm({
      employee_id: leave?.employee_id ?? currentEmpId,
      type:        leave?.type ?? "",
      from_date:   leave?.from_date.slice(0, 10) ?? "",
      to_date:     leave?.to_date.slice(0, 10) ?? "",
      half_day:    leave?.half_day ?? false,
      reason:      leave?.reason ?? "",
      status:      leave?.status ?? "pending",
    });
    setError(null);
    setLeaveModal(true);
  }

  async function handleLeaveSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (editLeave) await updateMutation.mutateAsync();
    else await createMutation.mutateAsync();
  }

  const canSelectEmp = hasApprove || canManage;
  const selectedTypeData = (typesQ.data ?? []).find(t => t.name === leaveForm.type);

  return (
    <div className="space-y-6">
      <PageHeader title="Leaves" subtitle="Manage leave requests, approvals, and leave types." />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline text-red-500" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* My balance widget */}
      {currentEmpId > 0 && activeTab === "my-requests" && (
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Leave Balance — {new Date().getFullYear()}</p>
          <BalanceWidget employeeId={currentEmpId} />
        </Card>
      )}

      <Card>
        {/* Tab bar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex flex-wrap gap-1">
            {tabs.filter(t => t.show).map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition
                  ${t.key === activeTab ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"}`}>
                {t.label}
              </button>
            ))}
          </div>
          {activeTab !== "leave-types" && activeTab !== "calendar" && (canCreate || hasApprove || canManage) && (
            <Button onClick={() => openLeave()}>+ New Leave</Button>
          )}
        </div>

        {/* Calendar tab */}
        {activeTab === "calendar" && <TeamCalendarView leaveTypes={typesQ.data ?? []} />}

        {/* Leave list tabs */}
        {(activeTab === "my-requests" || activeTab === "pending-approvals" || activeTab === "all-requests") && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">From</th>
                  <th className="p-3">To</th>
                  <th className="p-3">Days</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leavesQ.isLoading && [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    {[...Array(8)].map((__, j) => <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>)}
                  </tr>
                ))}
                {!leavesQ.isLoading && leaves.length === 0 && (
                  <tr><td colSpan={8} className="p-10 text-center text-sm text-[var(--muted)]">No leave requests found.</td></tr>
                )}
                {leaves.map(item => {
                  const isOwn     = item.employee_id === currentEmpId;
                  const canApproveThis = hasApprove && item.status === "pending";
                  const canDel    = item.status === "pending" && (hasApprove || isOwn);
                  return (
                    <tr key={item.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                      <td className="p-3 font-medium">
                        <Link to={`/employees/${item.employee_id}`} className="hover:underline text-[var(--primary)]">
                          {nameMap.get(item.employee_id) ?? item.employee?.name ?? `#${item.employee_id}`}
                        </Link>
                      </td>
                      <td className="p-3">
                        {item.type}
                        {item.half_day && <span className="ml-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">½ day</span>}
                      </td>
                      <td className="p-3">{item.from_date.slice(0,10)}</td>
                      <td className="p-3">{item.to_date.slice(0,10)}</td>
                      <td className="p-3 font-medium">{item.requested_days ?? "—"}</td>
                      <td className="p-3"><StatusBadge status={item.status} /></td>
                      <td className="p-3 max-w-[140px] truncate text-xs text-[var(--muted)]">{item.reason ?? "—"}</td>
                      <td className="p-3">
                        <div className="flex justify-end flex-wrap gap-1.5">
                          {canApproveThis && (
                            <>
                              <Button variant="outline" className="text-xs px-2 py-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => void statusMutation.mutateAsync({ id: item.id, status: "approved" })}>
                                ✓ Approve
                              </Button>
                              <Button variant="outline" className="text-xs px-2 py-1 border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => { setRejectModal(item); setRejectReason(""); }}>
                                ✕ Reject
                              </Button>
                            </>
                          )}
                          {hasApprove && <Button variant="outline" className="text-xs px-2 py-1" onClick={() => openLeave(item)}>Edit</Button>}
                          {canDel && (
                            <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => { if (window.confirm("Cancel/delete this leave?")) void deleteMutation.mutateAsync(item.id); }}>
                              {isOwn && !hasApprove ? "Cancel" : "Delete"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Leave Types tab */}
        {activeTab === "leave-types" && canManage && (
          <div className="space-y-6">
            {/* Leave types table */}
            <div>
              <div className="mb-3 flex justify-end">
                <Button onClick={() => { setEditType(null); setTypeModal(true); }}>+ New Leave Type</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                      <th className="p-3">Name</th>
                      <th className="p-3">Days</th>
                      <th className="p-3">Accrual</th>
                      <th className="p-3">CF</th>
                      <th className="p-3">Notice</th>
                      <th className="p-3">Flags</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(typesQ.data ?? []).map(t => (
                      <tr key={t.id} className="border-b border-[var(--border)]/50">
                        <td className="p-3 font-medium">{t.name}</td>
                        <td className="p-3">{t.default_days}</td>
                        <td className="p-3 text-xs text-[var(--muted)] capitalize">{t.accrual_frequency ?? "yearly"}{t.accrual_amount ? ` (${t.accrual_amount}d)` : ""}</td>
                        <td className="p-3">{t.carry_forward_days ?? 0}d</td>
                        <td className="p-3">{t.notice_period_days ? `${t.notice_period_days}d` : "—"}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {t.is_paid        && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">Paid</span>}
                            {t.allow_half_day && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700">½ day</span>}
                            {t.encashable     && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">Cash</span>}
                            {!t.is_active     && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs text-red-600">Inactive</span>}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setEditType(t); setTypeModal(true); }}>Edit</Button>
                            <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => { if (window.confirm(`Delete ${t.name}?`)) void deleteTypeMutation.mutateAsync(t.id); }}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Blackout dates */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Blackout Periods</h4>
                <Button variant="outline" onClick={() => setBlackoutModal(true)} className="text-xs">+ Add Blackout</Button>
              </div>
              {blackoutsQ.isLoading && <div className="h-16 animate-pulse rounded-xl bg-[var(--border)]" />}
              {!blackoutsQ.isLoading && (blackoutsQ.data ?? []).length === 0 && (
                <p className="py-3 text-center text-sm text-[var(--muted)]">No blackout periods defined.</p>
              )}
              <div className="space-y-2">
                {(blackoutsQ.data as LeaveBlackout[] | undefined ?? []).map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-[var(--muted)]">{b.start_date} → {b.end_date}
                        {b.leave_type && <span className="ml-2 rounded-full bg-[var(--border)]/40 px-2 py-0.5 text-xs">{b.leave_type.name} only</span>}
                      </p>
                    </div>
                    <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200"
                      onClick={() => { if (window.confirm("Delete blackout?")) void deleteBlackoutMutation.mutateAsync(b.id); }}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Leave request modal */}
      {leaveModal && (
        <Modal title={editLeave ? "Update Leave" : "Request Leave"} onClose={() => setLeaveModal(false)}>
          <form className="space-y-4" onSubmit={e => void handleLeaveSubmit(e)}>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            {canSelectEmp && (
              <FormField label="Employee">
                <select className={selectClass} value={leaveForm.employee_id}
                  onChange={e => setLeaveForm(p => ({ ...p, employee_id: Number(e.target.value) }))}>
                  <option value={0}>Select employee</option>
                  {(employeesQ.data ?? []).map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </FormField>
            )}

            <FormField label="Leave Type">
              <select required className={selectClass} value={leaveForm.type}
                onChange={e => setLeaveForm(p => ({ ...p, type: e.target.value }))}>
                <option value="">Select type</option>
                {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormField>

            {selectedTypeData?.notice_period_days && selectedTypeData.notice_period_days > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠ This leave type requires {selectedTypeData.notice_period_days} day(s) advance notice.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="From"><FormInput required type="date" value={leaveForm.from_date} onChange={e => setLeaveForm(p => ({ ...p, from_date: e.target.value }))} /></FormField>
              <FormField label="To"><FormInput required type="date" value={leaveForm.to_date} onChange={e => setLeaveForm(p => ({ ...p, to_date: e.target.value }))} /></FormField>
            </div>

            {selectedTypeData?.allow_half_day && (
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                  checked={leaveForm.half_day}
                  onChange={e => setLeaveForm(p => ({ ...p, half_day: e.target.checked }))} />
                Half-day leave (0.5 days)
              </label>
            )}

            {hasApprove && (
              <>
                <FormField label="Status">
                  <select className={selectClass} value={leaveForm.status}
                    onChange={e => setLeaveForm(p => ({ ...p, status: e.target.value as LeaveItem["status"] }))}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </FormField>
                <FormField label="Reason (optional)">
                  <textarea className="h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                    value={leaveForm.reason}
                    onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder="Approval/rejection reason..." />
                </FormField>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLeaveModal(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <Modal title="Reject Leave Request" onClose={() => setRejectModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Rejecting leave for <span className="font-medium text-[var(--text)]">{nameMap.get(rejectModal.employee_id) ?? `#${rejectModal.employee_id}`}</span>
              {" "}({rejectModal.from_date.slice(0,10)} → {rejectModal.to_date.slice(0,10)}).
            </p>
            <FormField label="Reason (optional)">
              <textarea className="h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Provide a brief reason..." />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
              <Button className="bg-red-600 text-white hover:bg-red-700"
                disabled={statusMutation.isPending}
                onClick={() => void statusMutation.mutateAsync({ id: rejectModal.id, status: "rejected", reason: rejectReason || undefined })}>
                {statusMutation.isPending ? "Rejecting…" : "Confirm rejection"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Leave type modal */}
      {typeModal && (
        <LeaveTypeModal
          editing={editType}
          onClose={() => setTypeModal(false)}
          onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ["hr","leave-types"] }); setTypeModal(false); }}
        />
      )}

      {/* Blackout modal */}
      {blackoutModal && (
        <Modal title="Add Blackout Period" onClose={() => setBlackoutModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void blackoutMutation.mutateAsync(); }}>
            <FormField label="Name"><FormInput required value={blackoutForm.name} onChange={e => setBlackoutForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Year-end freeze" /></FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Start date"><FormInput required type="date" value={blackoutForm.start_date} onChange={e => setBlackoutForm(p => ({ ...p, start_date: e.target.value }))} /></FormField>
              <FormField label="End date"><FormInput required type="date" value={blackoutForm.end_date} onChange={e => setBlackoutForm(p => ({ ...p, end_date: e.target.value }))} /></FormField>
            </div>
            <FormField label="Applies to leave type (leave blank for all)">
              <select className={selectClass} value={blackoutForm.leave_type_id}
                onChange={e => setBlackoutForm(p => ({ ...p, leave_type_id: e.target.value }))}>
                <option value="">All leave types</option>
                {(typesQ.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBlackoutModal(false)}>Cancel</Button>
              <Button type="submit" disabled={blackoutMutation.isPending}>{blackoutMutation.isPending ? "Saving…" : "Add Blackout"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
