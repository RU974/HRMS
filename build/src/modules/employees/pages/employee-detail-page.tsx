import { useState, type ChangeEvent, type FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { listDepartments, listDesignations, listShifts, listLeaves, listEmployeeDocuments, getEmployeeAttendance } from "@/services/hr-management-service";
import {
  getEmployeeOptions,
  BLOOD_GROUPS,
  getEmployee,
  updateEmployee,
  getEmployeePayslips,
  getEmployeeDirectReports,
  saveEmployeeEmergencyContacts,
  getEmployeePromotions,
  createEmployeePromotion,
  deleteEmployeePromotion,
  type Employee,
  type EmployeePromotion,
  type EmergencyContact,
} from "@/services/employee-service";
import type { Payslip } from "@/services/payroll-service";
import {
  getEmployeeAppraisals,
  getEmployeeReviews,
  getEmployeeGoals,
  getEmployeeKpis,
} from "@/services/performance-service";
import { useAuthStore } from "@/store/auth-store";
import { useCurrencyStore } from "@/store/currency-store";
import { toast } from "@/components/notifications/toast";

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    inactive: "bg-red-50 text-red-700 border-red-200",
    on_leave: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${colors[status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-[var(--border)]/50 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{label}</span>
      <span className="text-sm font-medium text-[var(--text)]">{value || "—"}</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "attendance" | "leaves" | "documents" | "salary" | "performance" | "org" | "history";

const tabs: { key: Tab; label: string }[] = [
  { key: "overview",     label: "Overview" },
  { key: "attendance",   label: "Attendance" },
  { key: "leaves",       label: "Leaves" },
  { key: "documents",    label: "Documents" },
  { key: "salary",       label: "Salary" },
  { key: "performance",  label: "Performance" },
  { key: "org",          label: "Org / Team" },
  { key: "history",      label: "History" },
];

interface DirectReport { id: number; name: string; designation?: string | null; status: string; department?: { name: string } | null }

const PROMOTION_TYPES = ["promotion", "transfer", "demotion", "grade_change"] as const;

// ── Salary tab ───────────────────────────────────────────────────────────────
function SalaryTab({ employee, employeeId }: { employee: Employee; employeeId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["payslips", "employee", employeeId],
    queryFn: () => getEmployeePayslips(employeeId),
  });
  const { formatAmount } = useCurrencyStore();
  // Subscribe to currency changes so the component re-renders
  useCurrencyStore(s => s.currency);
  const payslips = (data as { data?: Payslip[] } | undefined)?.data ?? [];
  const base   = Number(employee.basic_salary ?? 0);
  const allow  = Number(employee.allowances ?? 0);
  const gross  = base + allow;

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="mb-4 text-base font-semibold">Compensation Breakdown</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Basic Salary",  value: formatAmount(base) },
            { label: "Allowances",    value: formatAmount(allow) },
            { label: "Gross Salary",  value: formatAmount(gross) },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{s.label}</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text)]">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-base font-semibold">Payslip History</h3>
        {isLoading && <p className="text-sm text-[var(--muted)]">Loading payslips…</p>}
        {!isLoading && payslips.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">No payslips issued yet.</p>}
        {payslips.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Slip #</th>
                  <th className="p-3">Period</th>
                  <th className="p-3">Net Salary</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Issue Date</th>
                  <th className="p-3">File</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map(p => (
                  <tr key={p.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                    <td data-label="Slip #" className="p-3 font-mono text-xs">{p.slip_number}</td>
                    <td data-label="Period" className="p-3">{p.payroll ? `${p.payroll.year}-${String(p.payroll.month).padStart(2, "0")}` : "—"}</td>
                    <td data-label="Net Salary" className="p-3 font-semibold">{p.payroll ? formatAmount(Number(p.payroll.net_salary)) : "—"}</td>
                    <td data-label="Status" className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${p.status === "issued" ? "bg-emerald-50 text-emerald-700" : p.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{p.status}</span>
                    </td>
                    <td data-label="Issue Date" className="p-3 text-[var(--muted)]">{p.issue_date}</td>
                    <td data-label="File" className="p-3">
                      {p.file_url
                        ? <a href={p.file_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--primary)] hover:underline">Download</a>
                        : <span className="text-xs text-[var(--muted)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Performance tab ──────────────────────────────────────────────────────────
function PerformanceTab({ employeeId }: { employeeId: number }) {
  const appraisalsQ = useQuery({ queryKey: ["perf-appraisals", employeeId], queryFn: () => getEmployeeAppraisals(employeeId) });
  const reviewsQ    = useQuery({ queryKey: ["perf-reviews",    employeeId], queryFn: () => getEmployeeReviews(employeeId) });
  const goalsQ      = useQuery({ queryKey: ["perf-goals",      employeeId], queryFn: () => getEmployeeGoals(employeeId) });
  const kpisQ       = useQuery({ queryKey: ["perf-kpis",       employeeId], queryFn: () => getEmployeeKpis(employeeId) });

  const appraisals = appraisalsQ.data ?? [];
  const reviews    = reviewsQ.data ?? [];
  const goals      = goalsQ.data ?? [];
  const kpis       = kpisQ.data ?? [];

  const statusColor = (s: string) => s === "completed" ? "bg-emerald-50 text-emerald-700" : s === "in_progress" ? "bg-blue-50 text-blue-700" : s === "on_hold" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600";

  return (
    <div className="space-y-5">
      {/* Appraisals */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Appraisals</h3>
          <Link to="/performance" className="text-xs text-[var(--primary)] hover:underline">Manage →</Link>
        </div>
        {appraisalsQ.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {!appraisalsQ.isLoading && appraisals.length === 0 && <p className="py-3 text-center text-sm text-[var(--muted)]">No appraisals recorded.</p>}
        {appraisals.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Cycle</th><th className="p-3">Score</th><th className="p-3">Strengths</th><th className="p-3">Date</th></tr></thead>
              <tbody>
                {appraisals.map(a => (
                  <tr key={a.id} className="border-b border-[var(--border)]/50">
                    <td data-label="Cycle" className="p-3 font-medium">{a.cycle}</td>
                    <td data-label="Score" className="p-3"><span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">{a.overall_score}/5</span></td>
                    <td data-label="Strengths" className="p-3 max-w-xs truncate text-[var(--muted)]">{a.strengths ?? "—"}</td>
                    <td data-label="Date" className="p-3 text-[var(--muted)]">{a.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Reviews */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Reviews</h3>
        </div>
        {reviewsQ.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {!reviewsQ.isLoading && reviews.length === 0 && <p className="py-3 text-center text-sm text-[var(--muted)]">No reviews recorded.</p>}
        {reviews.length > 0 && (
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]"><th className="p-3">Period</th><th className="p-3">Rating</th><th className="p-3">Summary</th><th className="p-3">Date</th></tr></thead>
              <tbody>
                {reviews.map(r => (
                  <tr key={r.id} className="border-b border-[var(--border)]/50">
                    <td data-label="Period" className="p-3 font-medium">{r.period}</td>
                    <td data-label="Rating" className="p-3"><span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{r.rating}/5</span></td>
                    <td data-label="Summary" className="p-3 max-w-xs truncate text-[var(--muted)]">{r.summary ?? "—"}</td>
                    <td data-label="Date" className="p-3 text-[var(--muted)]">{r.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Goals */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-base font-semibold">Goals</h3>
          {goalsQ.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          {!goalsQ.isLoading && goals.length === 0 && <p className="py-3 text-center text-sm text-[var(--muted)]">No goals set.</p>}
          <div className="space-y-2">
            {goals.map(g => (
              <div key={g.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text)]">{g.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusColor(g.status)}`}>{g.status.replace("_", " ")}</span>
                </div>
                {g.due_date && <p className="mt-1 text-xs text-[var(--muted)]">Due {g.due_date}</p>}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]"><span>Progress</span><span>{g.progress}%</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <div className={`h-full rounded-full ${g.progress >= 100 ? "bg-emerald-500" : "bg-[var(--primary)]"}`} style={{ width: `${Math.min(g.progress, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* KPIs */}
        <Card>
          <h3 className="mb-3 text-base font-semibold">KPIs</h3>
          {kpisQ.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          {!kpisQ.isLoading && kpis.length === 0 && <p className="py-3 text-center text-sm text-[var(--muted)]">No KPIs set.</p>}
          <div className="space-y-2">
            {kpis.map(k => {
              const pct = Number(k.target_value) > 0 ? Math.min(Math.round((Number(k.current_value) / Number(k.target_value)) * 100), 100) : 0;
              return (
                <div key={k.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text)]">{k.name}</p>
                    <span className="text-xs text-[var(--muted)]">{Number(k.current_value).toLocaleString()} / {Number(k.target_value).toLocaleString()} {k.unit}</span>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]"><span>&nbsp;</span><span>{pct}%</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-[var(--primary)]" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Org / Team tab ──────────────────────────────────────────────────────────
function OrgTab({ employee, employeeId }: { employee: Employee; employeeId: number }) {
  const directReportsQ = useQuery({
    queryKey: ["direct-reports", employeeId],
    queryFn: () => getEmployeeDirectReports(employeeId),
  });
  const directReports = (directReportsQ.data?.data ?? []) as DirectReport[];

  return (
    <div className="space-y-5">
      {/* Manager chain */}
      <Card>
        <h3 className="mb-4 text-base font-semibold">Reporting Line</h3>
        <div className="flex flex-wrap items-center gap-2">
          {employee.manager ? (
            <>
              <Link to={`/employees/${employee.manager.id}`} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--border)]/30">
                {employee.manager.name}
              </Link>
              <span className="text-[var(--muted)]">→</span>
            </>
          ) : null}
          <div className="rounded-xl border-2 border-[var(--primary)] bg-[var(--primary)]/5 px-3 py-2 text-sm font-semibold text-[var(--primary)]">
            {employee.name} <span className="font-normal text-[var(--muted)]">(current)</span>
          </div>
          {directReports.length > 0 && (
            <>
              <span className="text-[var(--muted)]">→</span>
              <span className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--muted)]">{directReports.length} direct report{directReports.length !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>
        {!employee.manager && <p className="mt-2 text-xs text-[var(--muted)]">No manager assigned — this employee is at the top of the hierarchy.</p>}
      </Card>

      {/* Direct reports */}
      <Card>
        <h3 className="mb-4 text-base font-semibold">Direct Reports</h3>
        {directReportsQ.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {!directReportsQ.isLoading && directReports.length === 0 && (
          <p className="py-4 text-center text-sm text-[var(--muted)]">No direct reports.</p>
        )}
        {directReports.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {directReports.map(dr => (
              <Link key={dr.id} to={`/employees/${dr.id}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 transition hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-xs font-bold text-[var(--primary)]">
                  {dr.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text)]">{dr.name}</p>
                  <p className="text-xs text-[var(--muted)]">{dr.designation ?? dr.department?.name ?? "—"}</p>
                </div>
                <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${dr.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{dr.status}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── History (Emergency + Promotions) tab ──────────────────────────────────────
function HistoryTab({ employee, employeeId, canManage }: { employee: Employee; employeeId: number; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { formatAmount } = useCurrencyStore();
  useCurrencyStore(s => s.currency);

  // Emergency contacts
  const contacts: EmergencyContact[] = (employee as Employee & { emergency_contacts?: EmergencyContact[] }).emergency_contacts ?? [];
  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState<EmergencyContact>({ name: "", relationship: "", phone: "", email: "" });
  const [contactSaving, setContactSaving] = useState(false);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const emptyContactForm: EmergencyContact = { name: "", relationship: "", phone: "", email: "" };

  async function saveContacts(updated: EmergencyContact[]): Promise<boolean> {
    setContactSaving(true);
    try {
      await saveEmployeeEmergencyContacts(employeeId, updated);
      await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      return true;
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Could not save emergency contacts.");
      return false;
    } finally {
      setContactSaving(false);
    }
  }

  function openAddContact() {
    setEditingIndex(null);
    setContactForm(emptyContactForm);
    setContactModal(true);
  }

  function openEditContact(idx: number) {
    const c = contacts[idx];
    setEditingIndex(idx);
    setContactForm({ name: c.name, relationship: c.relationship, phone: c.phone, email: c.email ?? "" });
    setContactModal(true);
  }

  function closeContactModal() {
    setContactModal(false);
    setEditingIndex(null);
    setContactForm(emptyContactForm);
  }

  async function submitContact(e: FormEvent) {
    e.preventDefault();
    const email = (contactForm.email ?? "").trim();
    const entry: EmergencyContact = {
      name: contactForm.name.trim(),
      relationship: contactForm.relationship.trim(),
      phone: contactForm.phone.trim(),
      ...(email ? { email } : {}),
    };
    const updated = editingIndex === null
      ? [...contacts, entry]
      : contacts.map((c, i) => (i === editingIndex ? entry : c));
    if (await saveContacts(updated)) {
      toast.success("Saved", editingIndex === null ? "Emergency contact added." : "Emergency contact updated.");
      closeContactModal();
    }
  }

  async function removeContact(idx: number) {
    if (!window.confirm("Remove this emergency contact?")) return;
    if (await saveContacts(contacts.filter((_, i) => i !== idx))) {
      toast.success("Deleted", "Emergency contact removed.");
    }
  }

  // Promotions / transfer history
  const promotionsQ = useQuery({
    queryKey: ["promotions", employeeId],
    queryFn: () => getEmployeePromotions(employeeId),
  });
  const promotions = promotionsQ.data ?? [];

  const [promoModal, setPromoModal] = useState(false);
  const [promoForm, setPromoForm] = useState({ type: "promotion", from_designation: "", to_designation: "", from_department: "", to_department: "", from_salary: "", to_salary: "", effective_date: "", notes: "" });

  const promoMutation = useMutation({
    mutationFn: (data: typeof promoForm) => createEmployeePromotion(employeeId, data),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["promotions", employeeId] }); toast.success("Saved", "Promotion record added successfully."); setPromoModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const promoDeleteMutation = useMutation({
    mutationFn: (id: number) => deleteEmployeePromotion(employeeId, id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["promotions", employeeId] }); toast.success("Deleted", "Promotion record removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  const typeLabel: Record<string, string> = { promotion: "Promotion", transfer: "Transfer", demotion: "Demotion", grade_change: "Grade Change" };
  const typeColor: Record<string, string> = { promotion: "bg-emerald-50 text-emerald-700", transfer: "bg-blue-50 text-blue-700", demotion: "bg-rose-50 text-rose-700", grade_change: "bg-violet-50 text-violet-700" };

  return (
    <div className="space-y-5">
      {/* Emergency Contacts */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Emergency Contacts</h3>
          {canManage && <Button onClick={openAddContact}>+ Add Contact</Button>}
        </div>

        {contacts.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">No emergency contacts on file.</p>}
        <div className="space-y-2">
          {contacts.map((c, idx) => (
            <div key={idx} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-xs font-bold text-rose-600">
                {c.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--text)]">{c.name}</p>
                <p className="text-xs text-[var(--muted)] capitalize">{c.relationship} · {c.phone}</p>
                {c.email && <p className="text-xs text-[var(--muted)]">{c.email}</p>}
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" onClick={() => openEditContact(idx)} disabled={contactSaving} className="text-xs">Edit</Button>
                  <Button variant="outline" onClick={() => void removeContact(idx)} disabled={contactSaving} className="text-xs">Remove</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Promotion / Transfer History */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Promotion & Transfer History</h3>
          {canManage && <Button onClick={() => setPromoModal(true)}>+ Add Record</Button>}
        </div>

        {promotionsQ.isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {!promotionsQ.isLoading && promotions.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">No history recorded.</p>}

        {promotions.length > 0 && (
          <div className="relative space-y-0 pl-5">
            {promotions.map((p, idx) => (
              <div key={p.id} className={`relative pb-6 ${idx < promotions.length - 1 ? "border-l-2 border-[var(--border)]" : ""}`}>
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-[var(--primary)] bg-[var(--card)]" />
                <div className="ml-5 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColor[p.type] ?? "bg-slate-50 text-slate-600"}`}>{typeLabel[p.type] ?? p.type}</span>
                      <p className="mt-1.5 text-xs text-[var(--muted)]">Effective {p.effective_date}</p>
                    </div>
                    {canManage && (
                      <Button variant="outline" onClick={() => void promoDeleteMutation.mutate(p.id)} disabled={promoDeleteMutation.isPending} className="shrink-0 text-xs">Remove</Button>
                    )}
                  </div>
                  <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    {(p.from_designation || p.to_designation) && <p className="text-[var(--muted)]">Designation: <span className="font-medium text-[var(--text)]">{p.from_designation ?? "—"} → {p.to_designation ?? "—"}</span></p>}
                    {(p.from_department || p.to_department) && <p className="text-[var(--muted)]">Department: <span className="font-medium text-[var(--text)]">{p.from_department ?? "—"} → {p.to_department ?? "—"}</span></p>}
                    {(p.from_salary != null || p.to_salary != null) && <p className="text-[var(--muted)]">Salary: <span className="font-medium text-[var(--text)]">{p.from_salary ? formatAmount(Number(p.from_salary)) : "—"} → {p.to_salary ? formatAmount(Number(p.to_salary)) : "—"}</span></p>}
                  </div>
                  {p.notes && <p className="mt-2 text-xs text-[var(--muted)]">{p.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Contact Modal */}
      {contactModal && (
        <Modal title={editingIndex === null ? "Add Emergency Contact" : "Edit Emergency Contact"} onClose={closeContactModal}>
          <form className="space-y-4" onSubmit={(e) => void submitContact(e)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Name"><FormInput required value={contactForm.name} onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))} /></FormField>
              <FormField label="Relationship"><FormInput required value={contactForm.relationship} onChange={e => setContactForm(p => ({ ...p, relationship: e.target.value }))} placeholder="Spouse, Parent, Sibling…" /></FormField>
              <FormField label="Phone"><FormInput required value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))} /></FormField>
              <FormField label="Email (optional)"><FormInput type="email" value={contactForm.email ?? ""} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} /></FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeContactModal}>Cancel</Button>
              <Button type="submit" disabled={contactSaving}>{contactSaving ? "Saving…" : editingIndex === null ? "Add Contact" : "Save Changes"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Promotion Modal */}
      {promoModal && (
        <Modal title="Add Promotion / Transfer Record" onClose={() => setPromoModal(false)}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); promoMutation.mutate(promoForm); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Type">
                <select className={inputClass} value={promoForm.type} onChange={e => setPromoForm(p => ({ ...p, type: e.target.value }))}>
                  {PROMOTION_TYPES.map(t => <option key={t} value={t}>{typeLabel[t]}</option>)}
                </select>
              </FormField>
              <FormField label="Effective Date"><FormInput required type="date" value={promoForm.effective_date} onChange={e => setPromoForm(p => ({ ...p, effective_date: e.target.value }))} /></FormField>
              <FormField label="From Designation"><FormInput value={promoForm.from_designation} onChange={e => setPromoForm(p => ({ ...p, from_designation: e.target.value }))} /></FormField>
              <FormField label="To Designation"><FormInput value={promoForm.to_designation} onChange={e => setPromoForm(p => ({ ...p, to_designation: e.target.value }))} /></FormField>
              <FormField label="From Department"><FormInput value={promoForm.from_department} onChange={e => setPromoForm(p => ({ ...p, from_department: e.target.value }))} /></FormField>
              <FormField label="To Department"><FormInput value={promoForm.to_department} onChange={e => setPromoForm(p => ({ ...p, to_department: e.target.value }))} /></FormField>
              <FormField label="From Salary"><FormInput type="number" min="0" value={promoForm.from_salary} onChange={e => setPromoForm(p => ({ ...p, from_salary: e.target.value }))} /></FormField>
              <FormField label="To Salary"><FormInput type="number" min="0" value={promoForm.to_salary} onChange={e => setPromoForm(p => ({ ...p, to_salary: e.target.value }))} /></FormField>
            </div>
            <FormField label="Notes">
              <textarea className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={promoForm.notes} onChange={e => setPromoForm(p => ({ ...p, notes: e.target.value }))} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPromoModal(false)}>Cancel</Button>
              <Button type="submit" disabled={promoMutation.isPending}>{promoMutation.isPending ? "Saving…" : "Add Record"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useAuthStore((s) => s.hasPermission("employees:edit"));
  const { formatAmount } = useCurrencyStore();
  // Subscribe so re-render fires on currency change
  useCurrencyStore(s => s.currency);

  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployee(employeeId),
    enabled: !isNaN(employeeId),
  });

  const depsQuery    = useQuery({ queryKey: ["departments"],    queryFn: listDepartments });
  const desigQuery   = useQuery({ queryKey: ["designations"],   queryFn: listDesignations });
  const shiftsQuery  = useQuery({ queryKey: ["shifts"],         queryFn: listShifts });
  const managersQuery = useQuery({ queryKey: ["employees-list"], queryFn: getEmployeeOptions });

  const attendanceQuery = useQuery({
    queryKey: ["attendance", "employee", employeeId],
    queryFn: () => getEmployeeAttendance(employeeId),
    enabled: tab === "attendance",
  });

  const leavesQuery = useQuery({
    queryKey: ["leaves", "employee", employeeId],
    queryFn: () => listLeaves({ employee_id: employeeId }),
    enabled: tab === "leaves",
  });

  const docsQuery = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => listEmployeeDocuments({ employee_id: employeeId }),
    enabled: tab === "documents",
  });

  const [form, setForm] = useState({
    first_name: "", last_name: "", phone: "", cnic: "", date_of_birth: "",
    gender: "", blood_group: "", address: "", department_id: "", designation_id: "",
    joining_date: "", employment_type: "", shift_id: "", manager_id: "",
    basic_salary: "", allowances: "", commission_percentage: "", status: "",
  });

  const [editContacts, setEditContacts] = useState<EmergencyContact[]>([]);

  function updateEditContact(index: number, field: keyof EmergencyContact, value: string) {
    setEditContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function openEdit() {
    if (!employee) return;
    const existing = (employee as Employee & { emergency_contacts?: EmergencyContact[] | null }).emergency_contacts ?? [];
    setEditContacts(existing.map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone, email: c.email ?? "" })));
    const nameParts = (employee.name ?? "").split(" ");
    setForm({
      first_name: employee.first_name ?? nameParts[0] ?? "",
      last_name: employee.last_name ?? nameParts.slice(1).join(" ") ?? "",
      phone: employee.phone ?? "",
      cnic: employee.cnic ?? "",
      date_of_birth: employee.date_of_birth ?? "",
      gender: employee.gender ?? "",
      blood_group: employee.blood_group ?? "",
      address: employee.address ?? "",
      department_id: "",
      designation_id: "",
      joining_date: employee.joining_date ?? "",
      employment_type: employee.employment_type ?? "",
      shift_id: employee.shift?.id ? String(employee.shift.id) : employee.shift_id ? String(employee.shift_id) : "",
      manager_id: employee.manager?.id ? String(employee.manager.id) : employee.manager_id ? String(employee.manager_id) : "",
      basic_salary: employee.basic_salary ? String(employee.basic_salary) : "",
      allowances: employee.allowances ? String(employee.allowances) : "",
      commission_percentage: employee.commission_percentage != null ? String(employee.commission_percentage) : "",
      status: employee.status ?? "active",
    });
    setSaveError(null);
    setSaveSuccess(false);
    setPreviewUrl(employee.profile_image ?? null);
    setEditOpen(true);
  }

  const updateMutation = useMutation({
    mutationFn: (payload: FormData) => updateEmployee(employeeId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated", "Employee details have been saved.");
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setEditOpen(false), 800);
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setSaveError(e.message); },
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    const name = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ");
    if (name) fd.append("name", name);
    // Blank is sent explicitly so an existing commission can be cleared.
    if (!form.commission_percentage) fd.append("commission_percentage", "");
    // Fully blank rows are ignored; partially filled rows must have name, relationship and phone.
    const filled = editContacts
      .map((c) => ({ name: c.name.trim(), relationship: c.relationship.trim(), phone: c.phone.trim(), email: (c.email ?? "").trim() }))
      .filter((c) => c.name || c.relationship || c.phone || c.email);
    if (filled.some((c) => !c.name || !c.relationship || !c.phone)) {
      setSaveError("Each emergency contact needs a name, relationship, and phone number.");
      return;
    }
    // Always sent (even empty) so contacts can be removed from this form.
    fd.append("emergency_contacts", JSON.stringify(filled.map(({ email, ...rest }) => (email ? { ...rest, email } : rest))));
    if (profileImage) fd.append("profile_image", profileImage);
    fd.append("_method", "PUT");
    await updateMutation.mutateAsync(fd);
  }

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setProfileImage(file);
    if (file) setPreviewUrl(URL.createObjectURL(file));
  }

  const cardContacts = (employee as (Employee & { emergency_contacts?: EmergencyContact[] | null }) | undefined)?.emergency_contacts ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-[var(--border)]" />)}
        </div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee Not Found" subtitle="This employee record does not exist or you lack permission to view it." />
        <Button variant="outline" onClick={() => navigate("/employees")}>← Back to employees</Button>
      </div>
    );
  }

  const initials = (employee.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const attendanceList = attendanceQuery.data?.data ?? [];
  const presentCount   = attendanceList.filter((a) => a.status === "present").length;
  const lateCount      = attendanceList.filter((a) => a.status === "late").length;
  const absentCount    = attendanceList.filter((a) => a.status === "absent").length;
  const leaveCount     = (leavesQuery.data as { data?: unknown[] } | undefined)?.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => navigate("/employees")} className="text-xs">← Employees</Button>
        <PageHeader title={employee.name} subtitle={`${employee.designation ?? "Employee"} ${employee.department?.name ? `· ${employee.department.name}` : ""}`} />
        {canManage && <Button onClick={openEdit} className="ml-auto">Edit Employee</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center gap-4 text-center">
          {employee.profile_image ? (
            <img src={employee.profile_image} alt={employee.name} className="h-24 w-24 rounded-full object-cover ring-4 ring-[var(--border)]" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--primary)]/10 text-2xl font-bold text-[var(--primary)] ring-4 ring-[var(--border)]">{initials}</div>
          )}
          <div>
            <p className="text-lg font-bold">{employee.name}</p>
            <p className="text-sm text-[var(--muted)]">{employee.email}</p>
            {employee.employee_number && <p className="mt-1 text-xs text-[var(--muted)]">#{employee.employee_number}</p>}
          </div>
          <StatusBadge status={employee.status} />
          {employee.joining_date && <p className="text-xs text-[var(--muted)]">Joined {employee.joining_date}</p>}
          {cardContacts.length > 0 && (
            <div className="mt-2 w-full space-y-2 border-t border-[var(--border)] pt-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Emergency contact{cardContacts.length > 1 ? "s" : ""}</p>
              {cardContacts.map((c, i) => (
                <div key={i} className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{c.name} <span className="text-xs font-normal capitalize text-[var(--muted)]">· {c.relationship}</span></p>
                  <a href={`tel:${c.phone}`} className="text-xs text-[var(--primary)]">{c.phone}</a>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
            <InfoRow label="Department"      value={employee.department?.name} />
            <InfoRow label="Designation"     value={employee.designation} />
            <InfoRow label="Employment type" value={employee.employment_type?.replace("_", " ")} />
            <InfoRow label="Phone"           value={employee.phone} />
            <InfoRow label="CNIC"            value={employee.cnic} />
            <InfoRow label="Gender"          value={employee.gender} />
            <InfoRow label="Blood group"     value={employee.blood_group} />
            <InfoRow label="Date of birth"   value={employee.date_of_birth} />
            <InfoRow label="Shift"           value={employee.shift?.name} />
            <InfoRow label="Manager"         value={employee.manager?.name} />
            <InfoRow label="Basic salary"    value={employee.basic_salary ? formatAmount(Number(employee.basic_salary)) : undefined} />
            <InfoRow label="Allowances"      value={employee.allowances ? formatAmount(Number(employee.allowances)) : undefined} />
            <InfoRow label="Commission"      value={employee.commission_percentage != null && employee.commission_percentage !== "" ? `${Number(employee.commission_percentage)}%` : undefined} />
            <InfoRow label="Address"         value={employee.address} />
          </div>
        </Card>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.key
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Days present"    value={presentCount}  sub="From attendance records" />
          <StatCard label="Days late"       value={lateCount}     sub="Late arrivals recorded" />
          <StatCard label="Days absent"     value={absentCount}   sub="From attendance records" />
          <StatCard label="Leave requests"  value={leaveCount}    sub="Total requests submitted" />
        </div>
      )}

      {tab === "attendance" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold">Attendance Records</h3>
          {attendanceQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading attendance…</p>}
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Check In</th><th className="p-3">Check Out</th>
                </tr>
              </thead>
              <tbody>
                {attendanceList.length === 0 && !attendanceQuery.isLoading && (
                  <tr><td colSpan={4} className="p-6 text-center text-sm text-[var(--muted)]">No attendance records found.</td></tr>
                )}
                {attendanceList.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                    <td data-label="Date" className="p-3">{a.date}</td>
                    <td data-label="Status" className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${a.status === "present" ? "bg-emerald-50 text-emerald-700" : a.status === "late" ? "bg-amber-50 text-amber-700" : a.status === "absent" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{a.status}</span>
                    </td>
                    <td data-label="Check In" className="p-3">{a.check_in ? a.check_in.slice(11, 16) : "—"}</td>
                    <td data-label="Check Out" className="p-3">{a.check_out ? a.check_out.slice(11, 16) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "leaves" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold">Leave Requests</h3>
          {leavesQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading leaves…</p>}
          <div className="overflow-x-auto">
            <table className="rtable w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Type</th><th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {((leavesQuery.data as { data?: Array<{ id: number; type: string; from_date: string; to_date: string; status: string }> } | undefined)?.data ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-[var(--border)]/50">
                    <td data-label="Type" className="p-3 capitalize">{l.type}</td>
                    <td data-label="From" className="p-3">{l.from_date}</td>
                    <td data-label="To" className="p-3">{l.to_date}</td>
                    <td data-label="Status" className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${l.status === "approved" ? "bg-emerald-50 text-emerald-700" : l.status === "pending" ? "bg-amber-50 text-amber-700" : l.status === "rejected" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-700"}`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
                {((leavesQuery.data as { data?: unknown[] } | undefined)?.data ?? []).length === 0 && !leavesQuery.isLoading && (
                  <tr><td colSpan={4} className="p-6 text-center text-sm text-[var(--muted)]">No leave requests found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold">Employee Documents</h3>
          {docsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading documents…</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {(docsQuery.data?.data ?? []).map((doc) => (
              <div key={doc.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-sm font-bold text-[var(--primary)]">
                  {(doc.type ?? "DOC").slice(0, 3).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.title}</p>
                  <p className="text-xs text-[var(--muted)] capitalize">{doc.visibility?.replace("_", " ")}</p>
                  {doc.expiry_date && <p className="text-xs text-amber-600">Expires {doc.expiry_date}</p>}
                </div>
                <Link to="/employee-documents" className="ml-auto shrink-0 text-xs text-[var(--primary)] hover:underline">View</Link>
              </div>
            ))}
            {(docsQuery.data?.data ?? []).length === 0 && !docsQuery.isLoading && (
              <p className="col-span-2 py-6 text-center text-sm text-[var(--muted)]">No documents uploaded.</p>
            )}
          </div>
        </Card>
      )}

      {tab === "salary"      && <SalaryTab employee={employee} employeeId={employeeId} />}
      {tab === "performance" && <PerformanceTab employeeId={employeeId} />}
      {tab === "org"         && <OrgTab employee={employee} employeeId={employeeId} />}
      {tab === "history"     && <HistoryTab employee={employee} employeeId={employeeId} canManage={canManage} />}

      {/* Edit modal */}
      {editOpen && (
        <Modal title="Edit Employee" onClose={() => setEditOpen(false)}>
          <form onSubmit={(e) => void handleSave(e)} className="max-h-[70vh] overflow-y-auto space-y-4 pr-1">
            {saveError   && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>}
            {saveSuccess && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">Saved successfully!</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="First name"><FormInput value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} /></FormField>
              <FormField label="Last name"><FormInput value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} /></FormField>
              <FormField label="Phone"><FormInput value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></FormField>
              <FormField label="CNIC"><FormInput value={form.cnic} onChange={(e) => setForm((p) => ({ ...p, cnic: e.target.value }))} /></FormField>
              <FormField label="Date of birth"><FormInput type="date" value={form.date_of_birth} onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))} /></FormField>
              <FormField label="Gender">
                <select className={inputClass} value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
                  <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>
              </FormField>
              <FormField label="Blood group">
                <select className={inputClass} value={form.blood_group} onChange={(e) => setForm((p) => ({ ...p, blood_group: e.target.value }))}>
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </FormField>
              <FormField label="Department">
                <select className={inputClass} value={form.department_id} onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}>
                  <option value="">Select department</option>
                  {(depsQuery.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </FormField>
              <FormField label="Designation">
                <select className={inputClass} value={form.designation_id} onChange={(e) => setForm((p) => ({ ...p, designation_id: e.target.value }))}>
                  <option value="">Select designation</option>
                  {(desigQuery.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </FormField>
              <FormField label="Employment type">
                <select className={inputClass} value={form.employment_type} onChange={(e) => setForm((p) => ({ ...p, employment_type: e.target.value }))}>
                  <option value="">Select</option><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="intern">Intern</option>
                </select>
              </FormField>
              <FormField label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option>
                </select>
              </FormField>
              <FormField label="Shift">
                <select className={inputClass} value={form.shift_id} onChange={(e) => setForm((p) => ({ ...p, shift_id: e.target.value }))}>
                  <option value="">Select shift</option>
                  {(shiftsQuery.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </FormField>
              <FormField label="Manager">
                <select className={inputClass} value={form.manager_id} onChange={(e) => setForm((p) => ({ ...p, manager_id: e.target.value }))}>
                  <option value="">Select manager</option>
                  {(managersQuery.data?.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </FormField>
              <FormField label="Basic salary"><FormInput type="number" step="0.01" value={form.basic_salary} onChange={(e) => setForm((p) => ({ ...p, basic_salary: e.target.value }))} /></FormField>
              <FormField label="Allowances"><FormInput type="number" step="0.01" value={form.allowances} onChange={(e) => setForm((p) => ({ ...p, allowances: e.target.value }))} /></FormField>
              <FormField label="Commission (%)"><FormInput type="number" step="0.01" min="0" max="100" value={form.commission_percentage} onChange={(e) => setForm((p) => ({ ...p, commission_percentage: e.target.value }))} /></FormField>
              <FormField label="Joining date"><FormInput type="date" value={form.joining_date} onChange={(e) => setForm((p) => ({ ...p, joining_date: e.target.value }))} /></FormField>
            </div>
            <FormField label="Address">
              <textarea className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
            </FormField>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Emergency contacts</span>
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs"
                  disabled={editContacts.length >= 10}
                  onClick={() => setEditContacts((prev) => [...prev, { name: "", relationship: "", phone: "", email: "" }])}
                >
                  + Add Contact
                </Button>
              </div>
              {editContacts.length === 0 && <p className="text-xs text-[var(--muted)]">No emergency contacts yet.</p>}
              {editContacts.map((c, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--muted)]">Contact {i + 1}</span>
                    <button type="button" className="text-xs text-rose-600" onClick={() => setEditContacts((prev) => prev.filter((_, idx) => idx !== i))}>Remove</button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Name"><FormInput value={c.name} onChange={(e) => updateEditContact(i, "name", e.target.value)} /></FormField>
                    <FormField label="Relationship"><FormInput value={c.relationship} onChange={(e) => updateEditContact(i, "relationship", e.target.value)} placeholder="Spouse, Parent, Sibling…" /></FormField>
                    <FormField label="Phone"><FormInput value={c.phone} onChange={(e) => updateEditContact(i, "phone", e.target.value)} /></FormField>
                    <FormField label="Email (optional)"><FormInput type="email" value={c.email ?? ""} onChange={(e) => updateEditContact(i, "email", e.target.value)} /></FormField>
                  </div>
                </div>
              ))}
            </div>
            <FormField label="Profile photo">
              <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm" />
              {previewUrl && <img src={previewUrl} alt="Preview" className="mt-2 h-16 w-16 rounded-full object-cover" />}
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save changes"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
