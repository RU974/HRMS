import { useState, type ChangeEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modals/modal";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { apiClient } from "@/services/api-client";
import { listDepartments, listDesignations, listShifts, listLeaves, listAttendance } from "@/services/hr-management-service";
import { getEmployees, type Employee } from "@/services/employee-service";
import { useAuthStore } from "@/store/auth-store";

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30";

function getEmployee(id: number) {
  return apiClient<Employee>(`/employees/${id}`);
}

function updateEmployee(id: number, payload: FormData) {
  return apiClient<Employee>(`/employees/${id}`, { method: "POST", body: payload });
}

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

type Tab = "overview" | "attendance" | "leaves" | "documents";

const tabs: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "attendance", label: "Attendance" },
  { key: "leaves", label: "Leaves" },
  { key: "documents", label: "Documents" },
];

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useAuthStore((s) => s.hasPermission("manage employees"));

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

  const depsQuery = useQuery({ queryKey: ["departments"], queryFn: listDepartments });
  const desigQuery = useQuery({ queryKey: ["designations"], queryFn: listDesignations });
  const shiftsQuery = useQuery({ queryKey: ["shifts"], queryFn: listShifts });
  const managersQuery = useQuery({ queryKey: ["employees-list"], queryFn: () => getEmployees() });

  const attendanceQuery = useQuery({
    queryKey: ["attendance", "employee", employeeId],
    queryFn: () => apiClient<{ data: Array<{ id: number; date: string; check_in?: string | null; check_out?: string | null; status: string }> }>(`/attendance/employee/${employeeId}`),
    enabled: tab === "attendance",
  });

  const leavesQuery = useQuery({
    queryKey: ["leaves", "employee", employeeId],
    queryFn: () => listLeaves({ employee_id: employeeId }),
    enabled: tab === "leaves",
  });

  const docsQuery = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => apiClient<Array<{ id: number; title: string; type?: string | null; visibility: string; expiry_date?: string | null }>>(`/employee-documents?employee_id=${employeeId}`),
    enabled: tab === "documents",
  });

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    cnic: "",
    date_of_birth: "",
    gender: "",
    address: "",
    department_id: "",
    designation_id: "",
    joining_date: "",
    employment_type: "",
    shift_id: "",
    manager_id: "",
    basic_salary: "",
    allowances: "",
    status: "",
  });

  function openEdit() {
    if (!employee) return;
    const nameParts = (employee.name ?? "").split(" ");
    setForm({
      first_name: employee.first_name ?? nameParts[0] ?? "",
      last_name: employee.last_name ?? nameParts.slice(1).join(" ") ?? "",
      phone: employee.phone ?? "",
      cnic: employee.cnic ?? "",
      date_of_birth: employee.date_of_birth ?? "",
      gender: employee.gender ?? "",
      address: employee.address ?? "",
      department_id: "",
      designation_id: "",
      joining_date: employee.joining_date ?? "",
      employment_type: employee.employment_type ?? "",
      shift_id: employee.shift?.id ? String(employee.shift.id) : "",
      manager_id: employee.manager?.id ? String(employee.manager.id) : "",
      basic_salary: employee.basic_salary ? String(employee.basic_salary) : "",
      allowances: employee.allowances ? String(employee.allowances) : "",
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
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setEditOpen(false), 800);
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    const name = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ");
    if (name) fd.append("name", name);
    if (profileImage) fd.append("profile_image", profileImage);
    fd.append("_method", "PUT");
    await updateMutation.mutateAsync(fd);
  }

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setProfileImage(file);
    if (file) setPreviewUrl(URL.createObjectURL(file));
  }

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
  const attendanceList = (attendanceQuery.data as { data?: typeof attendanceQuery.data extends Promise<infer T> ? T : unknown[] } | undefined)?.data as Array<{ id: number; date: string; check_in?: string | null; check_out?: string | null; status: string }> | undefined ?? [];
  const presentCount = attendanceList.filter((a) => a.status === "present").length;
  const lateCount = attendanceList.filter((a) => a.status === "late").length;
  const absentCount = attendanceList.filter((a) => a.status === "absent").length;
  const leaveCount = (leavesQuery.data as { data?: Array<unknown> } | undefined)?.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => navigate("/employees")} className="text-xs">
          ← Employees
        </Button>
        <PageHeader title={employee.name} subtitle={`${employee.designation ?? "Employee"} ${employee.department?.name ? `· ${employee.department.name}` : ""}`} />
        {canManage && (
          <Button onClick={openEdit} className="ml-auto">Edit Employee</Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center gap-4 text-center">
          {employee.profile_image ? (
            <img src={employee.profile_image} alt={employee.name} className="h-24 w-24 rounded-full object-cover ring-4 ring-[var(--border)]" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--primary)]/10 text-2xl font-bold text-[var(--primary)] ring-4 ring-[var(--border)]">
              {initials}
            </div>
          )}
          <div>
            <p className="text-lg font-bold">{employee.name}</p>
            <p className="text-sm text-[var(--muted)]">{employee.email}</p>
            {employee.employee_number && <p className="mt-1 text-xs text-[var(--muted)]">#{employee.employee_number}</p>}
          </div>
          <StatusBadge status={employee.status} />
          {employee.joining_date && (
            <p className="text-xs text-[var(--muted)]">Joined {employee.joining_date}</p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
            <InfoRow label="Department" value={employee.department?.name} />
            <InfoRow label="Designation" value={employee.designation} />
            <InfoRow label="Employment type" value={employee.employment_type?.replace("_", " ")} />
            <InfoRow label="Phone" value={employee.phone} />
            <InfoRow label="CNIC" value={employee.cnic} />
            <InfoRow label="Gender" value={employee.gender} />
            <InfoRow label="Date of birth" value={employee.date_of_birth} />
            <InfoRow label="Shift" value={employee.shift?.name} />
            <InfoRow label="Manager" value={employee.manager?.name} />
            <InfoRow label="Basic salary" value={employee.basic_salary ? `${Number(employee.basic_salary).toLocaleString()}` : undefined} />
            <InfoRow label="Allowances" value={employee.allowances ? `${Number(employee.allowances).toLocaleString()}` : undefined} />
            <InfoRow label="Address" value={employee.address} />
          </div>
        </Card>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.key
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Days present" value={presentCount} sub="From attendance records" />
          <StatCard label="Days late" value={lateCount} sub="Late arrivals recorded" />
          <StatCard label="Days absent" value={absentCount} sub="From attendance records" />
          <StatCard label="Leave requests" value={leaveCount} sub="Total requests submitted" />
        </div>
      )}

      {tab === "attendance" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold">Attendance Records</h3>
          {attendanceQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading attendance...</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Check In</th>
                  <th className="p-3">Check Out</th>
                </tr>
              </thead>
              <tbody>
                {attendanceList.length === 0 && !attendanceQuery.isLoading && (
                  <tr><td colSpan={4} className="p-6 text-center text-sm text-[var(--muted)]">No attendance records found.</td></tr>
                )}
                {attendanceList.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10">
                    <td className="p-3">{a.date}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        a.status === "present" ? "bg-emerald-50 text-emerald-700" :
                        a.status === "late" ? "bg-amber-50 text-amber-700" :
                        a.status === "absent" ? "bg-red-50 text-red-700" :
                        "bg-blue-50 text-blue-700"
                      }`}>{a.status}</span>
                    </td>
                    <td className="p-3">{a.check_in ? a.check_in.slice(11, 16) : "—"}</td>
                    <td className="p-3">{a.check_out ? a.check_out.slice(11, 16) : "—"}</td>
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
          {leavesQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading leaves...</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="p-3">Type</th>
                  <th className="p-3">From</th>
                  <th className="p-3">To</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {((leavesQuery.data as { data?: Array<{ id: number; type: string; from_date: string; to_date: string; status: string }> } | undefined)?.data ?? []).length === 0 && !leavesQuery.isLoading && (
                  <tr><td colSpan={4} className="p-6 text-center text-sm text-[var(--muted)]">No leave requests found.</td></tr>
                )}
                {((leavesQuery.data as { data?: Array<{ id: number; type: string; from_date: string; to_date: string; status: string }> } | undefined)?.data ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-[var(--border)]/50">
                    <td className="p-3 capitalize">{l.type}</td>
                    <td className="p-3">{l.from_date}</td>
                    <td className="p-3">{l.to_date}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        l.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                        l.status === "pending" ? "bg-amber-50 text-amber-700" :
                        l.status === "rejected" ? "bg-red-50 text-red-700" :
                        "bg-gray-50 text-gray-700"
                      }`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold">Employee Documents</h3>
          {docsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading documents...</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {((docsQuery.data ?? []) as Array<{ id: number; title: string; type?: string | null; visibility: string; expiry_date?: string | null }>).length === 0 && !docsQuery.isLoading && (
              <p className="col-span-2 py-6 text-center text-sm text-[var(--muted)]">No documents uploaded.</p>
            )}
            {((docsQuery.data ?? []) as Array<{ id: number; title: string; type?: string | null; visibility: string; expiry_date?: string | null }>).map((doc) => (
              <div key={doc.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-sm font-bold text-[var(--primary)]">
                  {(doc.type ?? "DOC").slice(0, 3).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.title}</p>
                  <p className="text-xs text-[var(--muted)] capitalize">{doc.visibility?.replace("_", " ")}</p>
                  {doc.expiry_date && <p className="text-xs text-amber-600">Expires {doc.expiry_date}</p>}
                </div>
                <Link to={`/employee-documents`} className="ml-auto text-xs text-[var(--primary)] hover:underline shrink-0">View</Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editOpen && (
        <Modal title="Edit Employee" onClose={() => setEditOpen(false)}>
          <form onSubmit={handleSave} className="max-h-[70vh] overflow-y-auto space-y-4 pr-1">
            {saveError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>}
            {saveSuccess && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">Saved successfully!</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="First name">
                <FormInput value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} />
              </FormField>
              <FormField label="Last name">
                <FormInput value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} />
              </FormField>
              <FormField label="Phone">
                <FormInput value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </FormField>
              <FormField label="CNIC">
                <FormInput value={form.cnic} onChange={(e) => setForm((p) => ({ ...p, cnic: e.target.value }))} />
              </FormField>
              <FormField label="Date of birth">
                <FormInput type="date" value={form.date_of_birth} onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
              </FormField>
              <FormField label="Gender">
                <select className={inputClass} value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
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
                  <option value="">Select</option>
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                  <option value="intern">Intern</option>
                </select>
              </FormField>
              <FormField label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On leave</option>
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
              <FormField label="Basic salary">
                <FormInput type="number" step="0.01" value={form.basic_salary} onChange={(e) => setForm((p) => ({ ...p, basic_salary: e.target.value }))} />
              </FormField>
              <FormField label="Allowances">
                <FormInput type="number" step="0.01" value={form.allowances} onChange={(e) => setForm((p) => ({ ...p, allowances: e.target.value }))} />
              </FormField>
              <FormField label="Joining date">
                <FormInput type="date" value={form.joining_date} onChange={(e) => setForm((p) => ({ ...p, joining_date: e.target.value }))} />
              </FormField>
            </div>

            <FormField label="Address">
              <textarea
                className="h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </FormField>

            <FormField label="Profile photo">
              <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm" />
              {previewUrl && <img src={previewUrl} alt="Preview" className="mt-2 h-16 w-16 rounded-full object-cover" />}
            </FormField>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}