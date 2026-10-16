import { SortableTh, type SortState } from "@/components/tables/use-table-sort";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { toast } from "@/components/notifications/toast";
import { getEmployeeOptions } from "@/services/employee-service";
import {
  type PayrollFilters,
  type PayrollRecord,
  type PayrollStatus,
  approvePayroll,
  createPayroll,
  deletePayroll,
  downloadBankExport,
  downloadPayrollSummaryPdf,
  generatePayrollAndWait,
  listPayroll,
  markPayrollPaid,
  rejectPayroll,
  updatePayroll,
} from "@/services/payroll-service";
import { useAuthStore } from "@/store/auth-store";
import { Badge, SummaryCard, fmt, payrollBadge, sel } from "./payroll-shared";

const payrollRecordSchema = z.object({
  employee_id: z.coerce.number().min(1, "Employee is required"),
  month: z.coerce.number().min(1, "Month must be between 1 and 12").max(12, "Month must be between 1 and 12"),
  year: z.coerce.number().min(2020, "Enter a valid year"),
  base_salary: z.coerce.number().min(0, "Base salary is required"),
  allowances: z.coerce.number().min(0),
  bonus: z.coerce.number().min(0),
  commission: z.coerce.number().min(0),
  deductions: z.coerce.number().min(0),
  tax: z.coerce.number().min(0),
  payment_date: z.string(),
});

type PayrollRecordFormInput = z.input<typeof payrollRecordSchema>;
type PayrollRecordFormValues = z.output<typeof payrollRecordSchema>;

const emptyPayrollForm: PayrollRecordFormInput = {
  employee_id: 0,
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  base_salary: 0,
  allowances: 0,
  bonus: 0,
  commission: 0,
  deductions: 0,
  tax: 0,
  payment_date: "",
};

export function PayrollRecordsTab() {
  const queryClient = useQueryClient();
  const canManage = useAuthStore(s => s.hasPermission("payroll:manage_settings"));

  const employeesQ = useQuery({ queryKey: ["payroll", "employees"], queryFn: async () => (await getEmployeeOptions()).data ?? [] });

  // ── List: filters, sorting and paging all run on the server ───────────────
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayrollStatus | "">("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "period", dir: "desc" });

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const month = Number(monthFilter);
  const year = Number(yearFilter);
  const filters: PayrollFilters = {
    page,
    per_page: perPage,
    search: search || undefined,
    status: statusFilter || undefined,
    month: month >= 1 && month <= 12 ? month : undefined,
    year: year >= 2000 ? year : undefined,
    sort_by: sort.key as PayrollFilters["sort_by"],
    sort_dir: sort.dir,
  };

  const payrollsQ = useQuery({
    queryKey: ["payroll", "records", filters],
    queryFn: () => listPayroll(filters),
    placeholderData: keepPreviousData,
  });

  const employees = employeesQ.data ?? [];
  const payrolls = payrollsQ.data?.data ?? [];
  const total = payrollsQ.data?.total ?? 0;
  const totalPages = Math.max(1, payrollsQ.data?.last_page ?? 1);
  const rangeFrom = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeTo = Math.min(total, (page - 1) * perPage + payrolls.length);

  // Deleting the last row of the last page (or narrowing a filter) can leave us past the end.
  useEffect(() => {
    if (payrollsQ.data && page > totalPages) setPage(totalPages);
  }, [payrollsQ.data, page, totalPages]);

  function toggleSort(key: string) {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  // ── Generate modal ─────────────────────────────────────────────────────────
  const [genModal, setGenModal] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear,  setGenYear]  = useState(new Date().getFullYear());
  const genMut = useMutation({
    mutationFn: () => generatePayrollAndWait({ month: genMonth, year: genYear }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["payroll"] });
      const noSalary = result.no_salary ?? 0;
      toast.success("Payroll generated", `${result.created} created, ${result.skipped} skipped, ${result.failed} failed.${noSalary ? ` ${noSalary} employee${noSalary === 1 ? " has" : "s have"} no salary set and ${noSalary === 1 ? "was" : "were"} left out.` : ""}`);
      setGenModal(false);
    },
    onError: (e: Error) => toast.error("Generation failed", e.message),
  });

  // ── Bank export ────────────────────────────────────────────────────────────
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exportYear,  setExportYear]  = useState(new Date().getFullYear());
  const [exporting,   setExporting]   = useState(false);
  async function handleExport() {
    setExporting(true);
    try { await downloadBankExport(exportMonth, exportYear); }
    catch (e) { toast.error("Export failed", (e as Error).message); }
    finally { setExporting(false); }
  }

  // ── Payroll summary PDF ────────────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);
  async function handleSummaryPdf() {
    setPdfLoading(true);
    try { await downloadPayrollSummaryPdf(exportMonth, exportYear); }
    catch (e) { toast.error("PDF failed", (e as Error).message); }
    finally { setPdfLoading(false); }
  }

  // ── Payroll record form ────────────────────────────────────────────────────
  const [payrollModal,  setPayrollModal]  = useState(false);
  const [payrollEdit,   setPayrollEdit]   = useState<PayrollRecord | null>(null);
  const [payrollDetail, setPayrollDetail] = useState<PayrollRecord | null>(null);

  const {
    register: registerPayroll,
    handleSubmit: handlePayrollSubmit,
    watch: watchPayroll,
    reset: resetPayroll,
    formState: { errors: payrollErrors },
  } = useForm<PayrollRecordFormInput, any, PayrollRecordFormValues>({
    resolver: zodResolver(payrollRecordSchema),
    defaultValues: emptyPayrollForm,
  });

  const [watchedBase, watchedAllowances, watchedBonus, watchedCommission, watchedDeductions, watchedTax] = watchPayroll(["base_salary", "allowances", "bonus", "commission", "deductions", "tax"]);
  const previewNet = Math.max(0, Number(watchedBase) + Number(watchedAllowances) + Number(watchedBonus) + Number(watchedCommission) - Number(watchedDeductions) - Number(payrollEdit?.attendance_deduction ?? 0) - Number(watchedTax));

  // net_salary is always computed server-side now, so the payload only ever
  // carries the components that feed it — never a manually-entered total.
  const payrollCreate = useMutation({
    mutationFn: (values: PayrollRecordFormValues) => createPayroll(values),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll"] }); toast.success("Payroll created", "Payroll record created successfully."); setPayrollModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const payrollUpdate = useMutation({
    mutationFn: (values: PayrollRecordFormValues) => updatePayroll(payrollEdit!.id, { base_salary: values.base_salary, allowances: values.allowances, bonus: values.bonus, commission: values.commission, deductions: values.deductions, tax: values.tax, payment_date: values.payment_date }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["payroll"] }); toast.success("Payroll updated", "Payroll record updated successfully."); setPayrollModal(false); },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const payrollDelete = useMutation({
    mutationFn: deletePayroll,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll"] }); toast.success("Deleted", "Payroll record removed."); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  const payrollPaid = useMutation({
    mutationFn: markPayrollPaid,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll"] }); toast.success("Marked as paid", "Payroll has been marked as paid."); },
    onError: (e: Error) => toast.error("Action failed", e.message),
  });

  const payrollApprov = useMutation({
    mutationFn: approvePayroll,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll"] }); toast.success("Approved", "Payroll has been approved."); },
    onError: (e: Error) => toast.error("Approval failed", e.message),
  });

  const payrollReject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectPayroll(id, reason),
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ["payroll"] }); toast.success("Rejected", "Payroll sent back to draft."); },
    onError: (e: Error) => toast.error("Reject failed", e.message),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="flex gap-2 items-end">
            <div><label className="mb-1 block text-xs text-[var(--muted)]">Month</label><input type="number" min={1} max={12} value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))} className="h-9 w-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" /></div>
            <div><label className="mb-1 block text-xs text-[var(--muted)]">Year</label><input type="number" min={2020} value={exportYear} onChange={e => setExportYear(Number(e.target.value))} className="h-9 w-28 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" /></div>
            <Button variant="outline" className="text-xs" onClick={() => void handleExport()} disabled={exporting}>{exporting ? "Exporting…" : "⬇ Bank CSV Export"}</Button>
          </div>
          <Button variant="outline" className="text-xs" onClick={() => setGenModal(true)}>⚡ Generate Payroll</Button>
          <Button variant="outline" className="text-xs" onClick={() => void handleSummaryPdf()} disabled={pdfLoading || total === 0}>{pdfLoading ? "Generating…" : "⬇ Payroll PDF"}</Button>
          <Button className="ml-auto text-xs" onClick={() => { setPayrollEdit(null); resetPayroll(emptyPayrollForm); setPayrollModal(true); }}>+ Manual Entry</Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Search</label>
          <input type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Employee name or ID" className="h-9 w-56 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Status</label>
          <select value={statusFilter} onChange={e => changeFilter(() => setStatusFilter(e.target.value as PayrollStatus | ""))} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm">
            <option value="">All statuses</option>
            {(["draft", "reviewed", "approved", "paid", "pending", "processed", "cancelled"] as PayrollStatus[]).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Period month</label>
          <select value={monthFilter} onChange={e => changeFilter(() => setMonthFilter(e.target.value))} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm">
            <option value="">All months</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Period year</label>
          <input type="number" min={2000} value={yearFilter} onChange={e => changeFilter(() => setYearFilter(e.target.value))} placeholder="All" className="h-9 w-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm" />
        </div>
        {(searchInput || statusFilter || monthFilter || yearFilter) && (
          <Button variant="outline" className="text-xs" onClick={() => { setSearchInput(""); setSearch(""); setStatusFilter(""); setMonthFilter(""); setYearFilter(""); setPage(1); }}>Clear filters</Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="rtable w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <SortableTh label="Emp. ID" sortKey="emp_id" sort={sort} onSort={toggleSort} />
              <SortableTh label="Employee" sortKey="employee" sort={sort} onSort={toggleSort} />
              <SortableTh label="Period" sortKey="period" sort={sort} onSort={toggleSort} />
              <SortableTh label="Base" sortKey="base_salary" sort={sort} onSort={toggleSort} />
              <SortableTh label="Net" sortKey="net_salary" sort={sort} onSort={toggleSort} />
              <SortableTh label="Payment Date" sortKey="payment_date" sort={sort} onSort={toggleSort} />
              <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payrollsQ.isLoading && [...Array(4)].map((_, i) => (
              <tr key={i} className="border-b border-[var(--border)]/50">
                {[...Array(8)].map((__, j) => <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-[var(--border)]" /></td>)}
              </tr>
            ))}
            {payrolls.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                <td className="p-3" data-label="Emp. ID">{item.employee?.employee_number ?? `#${item.employee_id}`}</td>
                <td className="p-3 font-medium" data-label="Employee">{item.employee?.name ?? `#${item.employee_id}`}</td>
                <td className="p-3" data-label="Period">{item.month}/{item.year}</td>
                <td className="p-3" data-label="Base">{fmt(Number(item.base_salary))}</td>
                <td className="p-3 font-semibold" data-label="Net">{fmt(Number(item.net_salary))}</td>
                <td className="p-3" data-label="Payment Date">{item.payment_date?.slice(0, 10) ?? "—"}</td>
                <td className="p-3" data-label="Status"><Badge label={item.status} tone={payrollBadge(item.status)} /></td>
                <td className="p-3" data-label="Actions">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setPayrollDetail(item)}>View</Button>
                    {canManage && (item.status === "draft" || item.status === "reviewed" || item.status === "pending") && (
                      <Button variant="outline" className="text-xs px-2 py-1 border-blue-200 text-blue-700" onClick={() => void payrollApprov.mutateAsync(item.id)}>✓ Approve</Button>
                    )}
                    {canManage && (item.status === "reviewed" || item.status === "pending") && (
                      <Button variant="outline" className="text-xs px-2 py-1 border-amber-200 text-amber-700" onClick={() => { const reason = window.prompt("Reason for sending this payroll back to draft?"); if (reason) void payrollReject.mutateAsync({ id: item.id, reason }); }}>↩ Reject</Button>
                    )}
                    {canManage && item.status === "approved" && (
                      <Button variant="outline" className="text-xs px-2 py-1 border-emerald-200 text-emerald-700" onClick={() => void payrollPaid.mutateAsync(item.id)}>✓ Mark Paid</Button>
                    )}
                    {canManage && item.status === "draft" && (
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => { setPayrollEdit(item); resetPayroll({ employee_id: item.employee_id, month: item.month, year: item.year, base_salary: Number(item.base_salary), allowances: Number(item.allowances ?? 0), bonus: Number(item.bonus), commission: Number(item.commission ?? 0), deductions: Number(item.deductions), tax: Number(item.tax), payment_date: item.payment_date?.slice(0, 10) ?? "" }); setPayrollModal(true); }}>Edit</Button>
                    )}
                    {canManage && item.status !== "paid" && (
                      <Button variant="outline" className="text-xs px-2 py-1 text-red-600 border-red-200" onClick={() => { if (window.confirm("Delete payroll?")) void payrollDelete.mutateAsync(item.id); }}>Delete</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {payrollsQ.isError && (
              <tr><td colSpan={8} className="p-8 text-center text-sm text-red-600">Could not load payroll records. {(payrollsQ.error as Error)?.message}</td></tr>
            )}
            {!payrollsQ.isLoading && !payrollsQ.isError && payrolls.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-sm text-[var(--muted)]">{search || statusFilter || monthFilter || yearFilter ? "No payroll records match these filters." : "No payroll records. Generate payroll or add manually."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
          <p className="text-xs text-[var(--muted)]">
            Showing {rangeFrom}–{rangeTo} of {total} record{total === 1 ? "" : "s"} · Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--muted)]" htmlFor="payroll-per-page">Per page</label>
            <select id="payroll-per-page" value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs">
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page">«</Button>
            <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Button>
            <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next →</Button>
            <Button variant="outline" className="text-xs px-3 py-1.5" disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label="Last page">»</Button>
          </div>
        </div>
      )}

      {/* Generate modal */}
      {genModal && (
        <Modal title="Generate Monthly Payroll" onClose={() => setGenModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">Auto-calculate payroll for all active employees. Existing records for the period are skipped.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month"><FormInput type="number" min={1} max={12} value={genMonth} onChange={e => setGenMonth(Number(e.target.value))} /></FormField>
              <FormField label="Year"><FormInput type="number" min={2020} value={genYear} onChange={e => setGenYear(Number(e.target.value))} /></FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGenModal(false)}>Cancel</Button>
              <Button onClick={() => void genMut.mutateAsync()} disabled={genMut.isPending}>{genMut.isPending ? "Generating…" : "Generate"}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Payroll detail modal */}
      {payrollDetail && (
        <Modal title={`Payroll — ${payrollDetail.employee?.name ?? `#${payrollDetail.employee_id}`}`} onClose={() => setPayrollDetail(null)}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Employee ID" value={payrollDetail.employee?.employee_number ?? `#${payrollDetail.employee_id}`} />
              <SummaryCard label="Period" value={`${payrollDetail.month}/${payrollDetail.year}`} />
              <SummaryCard label="Status" value={payrollDetail.status} />
              <SummaryCard label="Payment Date" value={payrollDetail.payment_date?.slice(0, 10) ?? "—"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard label="Base Salary" value={fmt(Number(payrollDetail.base_salary))} />
              <SummaryCard label="Allowances" value={fmt(Number(payrollDetail.allowances ?? 0))} />
              <SummaryCard label="Bonus" value={fmt(Number(payrollDetail.bonus))} />
              {Number(payrollDetail.commission ?? 0) > 0 && (
                <SummaryCard label="Commission" value={fmt(Number(payrollDetail.commission))} />
              )}
              {Number(payrollDetail.overtime_pay ?? 0) > 0 && (
                <SummaryCard label={`Overtime (${fmt(Number(payrollDetail.overtime_hours ?? 0))} hrs)`} value={fmt(Number(payrollDetail.overtime_pay))} />
              )}
              <SummaryCard label="Deductions" value={fmt(Number(payrollDetail.deductions))} />
              {Number(payrollDetail.attendance_deduction ?? 0) > 0 && (
                <SummaryCard label={`Absence / unpaid leave (${fmt(Number(payrollDetail.unpaid_days ?? 0))} days)`} value={fmt(Number(payrollDetail.attendance_deduction))} />
              )}
              <SummaryCard label="Tax" value={fmt(Number(payrollDetail.tax))} />
            </div>
            {payrollDetail.attendance_summary && Number(payrollDetail.attendance_deduction ?? 0) > 0 && (
              <div className="rounded-lg bg-[var(--background)] p-2 text-xs text-[var(--muted)]">
                Of {payrollDetail.attendance_summary.scheduled_days} working days: {payrollDetail.attendance_summary.absent_days} absent, {payrollDetail.attendance_summary.unpaid_leave_days} unpaid leave, {payrollDetail.attendance_summary.half_days} half day(s), {payrollDetail.attendance_summary.late_count} late ({payrollDetail.attendance_summary.late_blocks} penalised){payrollDetail.attendance_summary.pre_joining_days > 0 ? `, ${payrollDetail.attendance_summary.pre_joining_days} before joining` : ""}.
              </div>
            )}
            {payrollDetail.rejection_reason && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Rejected: {payrollDetail.rejection_reason}
              </div>
            )}
            <div className="rounded-xl border-2 border-[var(--primary)]/30 bg-[var(--primary)]/5 p-3 text-center">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Net Salary</p>
              <p className="text-3xl font-bold text-[var(--primary)]">{fmt(Number(payrollDetail.net_salary))}</p>
            </div>
          </div>
        </Modal>
      )}

      {/* Payroll record form modal */}
      {payrollModal && (
        <Modal title={`${payrollEdit ? "Edit" : "New"} Payroll Record`} onClose={() => setPayrollModal(false)}>
          <form className="space-y-4" onSubmit={handlePayrollSubmit(values => (payrollEdit ? payrollUpdate : payrollCreate).mutate(values))}>
            <FormField label="Employee">
              <select disabled={!!payrollEdit} className={sel} {...registerPayroll("employee_id")}>
                <option value={0}>Select employee</option>
                {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              {payrollErrors.employee_id && <p className="mt-1 text-xs text-red-500">{payrollErrors.employee_id.message}</p>}
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Month">
                <FormInput disabled={!!payrollEdit} type="number" min={1} max={12} {...registerPayroll("month")} />
                {payrollErrors.month && <p className="mt-1 text-xs text-red-500">{payrollErrors.month.message}</p>}
              </FormField>
              <FormField label="Year">
                <FormInput disabled={!!payrollEdit} type="number" min={2020} {...registerPayroll("year")} />
                {payrollErrors.year && <p className="mt-1 text-xs text-red-500">{payrollErrors.year.message}</p>}
              </FormField>
              <FormField label="Base Salary">
                <FormInput disabled={!!payrollEdit} type="number" min={0} step="0.01" {...registerPayroll("base_salary")} />
                {payrollErrors.base_salary && <p className="mt-1 text-xs text-red-500">{payrollErrors.base_salary.message}</p>}
              </FormField>
              <FormField label="Allowances">
                <FormInput type="number" min={0} step="0.01" {...registerPayroll("allowances")} />
              </FormField>
              <FormField label="Bonus">
                <FormInput type="number" min={0} step="0.01" {...registerPayroll("bonus")} />
              </FormField>
              <FormField label="Commission">
                <FormInput type="number" min={0} step="0.01" {...registerPayroll("commission")} />
              </FormField>
              <FormField label="Deductions">
                <FormInput type="number" min={0} step="0.01" {...registerPayroll("deductions")} />
              </FormField>
              <FormField label="Tax">
                <FormInput type="number" min={0} step="0.01" {...registerPayroll("tax")} />
              </FormField>
              <FormField label="Payment Date">
                <FormInput type="date" {...registerPayroll("payment_date")} />
              </FormField>
            </div>
            {payrollEdit && (
              <p className="text-xs text-[var(--muted)]">Status changes go through Approve / Reject / Mark Paid, not this form.</p>
            )}
            <div className="rounded-lg bg-[var(--background)] p-2 text-sm text-[var(--muted)]">
              Net: <strong className="text-[var(--text)]">{fmt(previewNet)}</strong>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayrollModal(false)}>Cancel</Button>
              <Button type="submit" disabled={payrollCreate.isPending || payrollUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
