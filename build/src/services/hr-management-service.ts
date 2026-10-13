import { apiClient, API_BASE_URL } from "./api-client";
import { useAuthStore } from "@/store/auth-store";

export interface DepartmentItem {
  id: number;
  name: string;
  employees_count?: number;
  deleted_at?: string | null;
}

export interface DesignationItem {
  id: number;
  name: string;
}

export interface ShiftItem {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  /** ISO weekday numbers, 1 = Monday ... 7 = Sunday. Null on shifts created before this field existed. */
  working_days?: number[] | null;
  grace_minutes: number;
  is_active: boolean;
  department_graces?: { department_id: number; grace_minutes: number }[];
}

export interface HolidayItem {
  id: number;
  name: string;
  holiday_date: string;
  is_optional: boolean;
}

export interface AttendanceItem {
  id: number;
  employee_id: number;
  date: string;
  check_in?: string | null;
  check_out?: string | null;
  status: "present" | "absent" | "leave" | "late";
  notes?: string | null;
  employee?: { id: number; name: string } | null;
  source?: "biometric" | "manual" | "mobile" | "web";
  work_from_home?: boolean;
  overtime_hours?: number;
  duration_hours?: number;
  is_late_arrival?: boolean;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  correction_status?: "pending" | "approved" | "rejected" | null;
  correction_request_notes?: string | null;
  correction_proposed_check_in?: string | null;
  correction_proposed_check_out?: string | null;
  correction_response_notes?: string | null;
  correction_requested_at?: string | null;
  correction_reviewed_at?: string | null;
  biometric_device_id?: number | null;
}

export interface LeaveItem {
  id: number;
  employee_id: number;
  type: string;
  from_date: string;
  to_date: string;
  half_day?: boolean;
  reason?: string | null;
  requested_days?: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  employee?: { id: number; name: string } | null;
}

export interface LeaveTypeItem {
  id: number;
  name: string;
  default_days: number;
  is_paid: boolean;
  is_active?: boolean;
  accrual_frequency?: string;
  accrual_amount?: number;
  carry_forward_days?: number;
  max_balance?: number;
  required_approval_levels?: number;
  min_request_days?: number;
  max_request_days?: number;
  notice_period_days?: number;
  allow_half_day?: boolean;
  encashable?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveBalance {
  leave_type: { id: number; name: string; is_paid: boolean; encashable: boolean };
  accrued_days: number;
  used_days: number;
  pending_days: number;
  carried_forward_days: number;
  remaining_days: number;
}

export interface LeaveBlackout {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  leave_type_id?: number | null;
  leave_type?: { id: number; name: string } | null;
  company_id?: number | null;
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface DepartmentDetailItem extends DepartmentItem {
  employees?: Array<{
    id: number;
    name: string;
    email?: string | null;
    company?: { id: string; name: string } | null;
    branch?: { id: string; name: string } | null;
  }>;
}

export const listDepartments = () => apiClient<DepartmentItem[]>("/departments");
export const listDepartmentsForCompany = (companyId: string) =>
  apiClient<DepartmentItem[]>(`/departments?company_id=${companyId}`);
export const getDepartment = (id: number) => apiClient<DepartmentDetailItem>(`/departments/${id}`);
export const createDepartment = (payload: { name: string }) => apiClient<DepartmentItem>("/departments", { method: "POST", body: JSON.stringify(payload) });
export const updateDepartment = (id: number, payload: { name: string }) => apiClient<DepartmentItem>(`/departments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteDepartment = (id: number) => apiClient<null>(`/departments/${id}`, { method: "DELETE" });

export const listDesignations = () => apiClient<DesignationItem[]>("/designations");
export const createDesignation = (payload: { name: string }) => apiClient<DesignationItem>("/designations", { method: "POST", body: JSON.stringify(payload) });
export const updateDesignation = (id: number, payload: { name: string }) => apiClient<DesignationItem>(`/designations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteDesignation = (id: number) => apiClient<null>(`/designations/${id}`, { method: "DELETE" });

export interface MasterDataImportResult { imported: number; skipped: number; errors: string[] }

async function exportMasterDataCsv(path: "departments" | "designations"): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE_URL}/${path}/export`, {
    headers: { Authorization: `Bearer ${token ?? ""}`, Accept: "text/csv" },
  });
  if (!res.ok) throw new Error(`${path} export failed`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `${path}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function importMasterDataCsv(path: "departments" | "designations", file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return apiClient<MasterDataImportResult>(`/${path}/import`, { method: "POST", body: fd });
}

export const exportDepartmentsCsv = () => exportMasterDataCsv("departments");
export const importDepartmentsCsv = (file: File) => importMasterDataCsv("departments", file);
export const exportDesignationsCsv = () => exportMasterDataCsv("designations");
export const importDesignationsCsv = (file: File) => importMasterDataCsv("designations", file);


export const listShifts = () => apiClient<ShiftItem[]>("/shifts");
export const createShift = (payload: Omit<ShiftItem, "id">) => apiClient<ShiftItem>("/shifts", { method: "POST", body: JSON.stringify(payload) });
export const updateShift = (id: number, payload: Partial<Omit<ShiftItem, "id">>) => apiClient<ShiftItem>(`/shifts/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteShift = (id: number) => apiClient<null>(`/shifts/${id}`, { method: "DELETE" });

export const listHolidays = () => apiClient<HolidayItem[]>("/holidays");
export const createHoliday = (payload: Omit<HolidayItem, "id">) => apiClient<HolidayItem>("/holidays", { method: "POST", body: JSON.stringify(payload) });
export const updateHoliday = (id: number, payload: Partial<Omit<HolidayItem, "id">>) => apiClient<HolidayItem>(`/holidays/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteHoliday = (id: number) => apiClient<null>(`/holidays/${id}`, { method: "DELETE" });

export const listAttendance = () => apiClient<PaginatedResponse<AttendanceItem>>("/attendance?per_page=50");
export const createAttendance = (payload: { employee_id: number; date: string; check_in?: string | null; check_out?: string | null; status?: AttendanceItem["status"]; work_from_home?: boolean; notes?: string | null }) =>
  apiClient<AttendanceItem>("/attendance", { method: "POST", body: JSON.stringify(payload) });
export const updateAttendance = (id: number, payload: { date?: string; check_in?: string | null; check_out?: string | null; status?: AttendanceItem["status"]; work_from_home?: boolean; notes?: string | null }) =>
  apiClient<AttendanceItem>(`/attendance/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteAttendance = (id: number) => apiClient<null>(`/attendance/${id}`, { method: "DELETE" });
export const checkInAttendance = (employeeId: number) =>
  apiClient<AttendanceItem>("/attendance/check-in", {
    method: "POST",
    body: JSON.stringify({ employee_id: employeeId }),
  });
export const checkOutAttendance = (employeeId: number) =>
  apiClient<AttendanceItem>("/attendance/check-out", {
    method: "POST",
    body: JSON.stringify({ employee_id: employeeId }),
  });

export interface TeamDailyAttendanceRow {
  employee_id: number;
  name: string;
  department?: string | null;
  designation?: string | null;
  attendance?: AttendanceItem | null;
  monthly_absences: number;
}

export interface AttendanceListFilters { month?: number; year?: number; status?: string }

export function listAttendancePaginated(page: number, employeeId?: number, search?: string, filters: AttendanceListFilters = {}) {
  let url = `/attendance?per_page=20&page=${page}`;
  if (employeeId) url += `&employee_id=${employeeId}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (filters.month) url += `&month=${filters.month}`;
  if (filters.year) url += `&year=${filters.year}`;
  if (filters.status) url += `&status=${encodeURIComponent(filters.status)}`;
  return apiClient<PaginatedResponse<AttendanceItem>>(url);
}

export async function exportAttendanceCsv(search?: string, filters: AttendanceListFilters = {}): Promise<void> {
  const token = useAuthStore.getState().token;
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (filters.month) q.set("month", String(filters.month));
  if (filters.year) q.set("year", String(filters.year));
  if (filters.status) q.set("status", filters.status);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await fetch(`${API_BASE_URL}/attendance/export${qs}`, {
    headers: { Authorization: `Bearer ${token ?? ""}`, Accept: "text/csv" },
  });
  if (!res.ok) throw new Error("Attendance export failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface AttendanceImportResult { imported: number; skipped: number; errors: string[] }

export function importAttendanceCsv(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return apiClient<AttendanceImportResult>("/attendance/import", { method: "POST", body: fd });
}

export function getEmployeeAttendanceCalendar(employeeId: number, month: number, year: number) {
  return apiClient<{ data: AttendanceItem[] }>(`/attendance/employee/${employeeId}?month=${month}&year=${year}&per_page=31`);
}

/** Approved/pending leaves overlapping a month, used to flag half-day leaves on the calendar. */
export function getEmployeeLeavesForMonth(employeeId: number, month: number, year: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return apiClient<PaginatedResponse<LeaveItem>>(
    `/leaves?employee_id=${employeeId}&from_date=${year}-${pad(month)}-01&to_date=${year}-${pad(month)}-${pad(last)}&per_page=100`,
  );
}

export function getEmployeeAttendance(employeeId: number) {
  return apiClient<{ data: AttendanceItem[] }>(`/attendance/employee/${employeeId}`);
}

export function getTeamDailyAttendance(date: string) {
  return apiClient<TeamDailyAttendanceRow[]>(`/attendance/team-daily?date=${date}`);
}

export interface AttendanceMonthlyStats {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total_days: number;
  off_days: number;
  wfh_days: number;
  total_hours: number;
  overtime_hours: number;
}

export function getAttendanceMonthlyStats(employeeId: number, month: number, year: number) {
  return apiClient<AttendanceMonthlyStats>(
    `/attendance/monthly-stats/${employeeId}/${month}/${year}`
  );
}

export function requestAttendanceCorrection(id: number, note: string, proposed?: { check_in?: string; check_out?: string }) {
  return apiClient(`/attendance/${id}/request-correction`, {
    method: "POST",
    body: JSON.stringify({
      correction_request_notes: note,
      proposed_check_in: proposed?.check_in || null,
      proposed_check_out: proposed?.check_out || null,
    }),
  });
}

export function listAttendanceCorrections(params: {
  status?: "pending" | "approved" | "rejected";
  employee_id?: number;
  month?: number;
  year?: number;
  page?: number;
} = {}) {
  const q = new URLSearchParams({ per_page: "20" });
  if (params.status)      q.set("status",      params.status);
  if (params.employee_id) q.set("employee_id", String(params.employee_id));
  if (params.month)       q.set("month",       String(params.month));
  if (params.year)        q.set("year",        String(params.year));
  if (params.page)        q.set("page",        String(params.page));
  return apiClient<PaginatedResponse<AttendanceItem>>(`/attendance/corrections?${q.toString()}`);
}

export function reviewAttendanceCorrection(
  id: number,
  payload: { correction_status: "approved" | "rejected"; correction_response_notes?: string | null }
) {
  return apiClient<AttendanceItem>(`/attendance/${id}/review-correction`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAttendanceByFilter(filters: { month?: number; year?: number; status?: string; per_page?: number }) {
  const params = new URLSearchParams();
  if (filters.month !== undefined) params.set("month", String(filters.month));
  if (filters.year !== undefined) params.set("year", String(filters.year));
  if (filters.status) params.set("status", filters.status);
  params.set("per_page", String(filters.per_page ?? 25));
  return apiClient<{ data: AttendanceItem[] }>(`/attendance?${params.toString()}`);
}

export const listLeaves = (filters: { employee_id?: number; status?: LeaveItem["status"] } = {}) => {
  const query = new URLSearchParams({ per_page: "50" });

  if (filters.employee_id !== undefined) {
    query.set("employee_id", String(filters.employee_id));
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  return apiClient<PaginatedResponse<LeaveItem>>(`/leaves?${query.toString()}`);
};
export const createLeave = (payload: { employee_id: number; type: string; from_date: string; to_date: string; half_day?: boolean; reason?: string; status?: LeaveItem["status"] }) =>
  apiClient<LeaveItem>("/leaves", { method: "POST", body: JSON.stringify(payload) });
export const updateLeave = (id: number, payload: { type?: string; from_date?: string; to_date?: string; half_day?: boolean; reason?: string; status?: LeaveItem["status"] }) =>
  apiClient<LeaveItem>(`/leaves/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteLeave = (id: number) => apiClient<null>(`/leaves/${id}`, { method: "DELETE" });

export const getLeaveBalances = (employeeId?: number) =>
  apiClient<LeaveBalance[]>(`/leaves/balance-summary${employeeId ? `?employee_id=${employeeId}` : ""}`);
export const getLeaveEncashment = (employeeId?: number) =>
  apiClient<{ daily_rate: number; items: { leave_type: string; remaining_days: number; daily_rate: number; encashment_amount: number }[]; total_encashment: number }>(`/leaves/encashment${employeeId ? `?employee_id=${employeeId}` : ""}`);
export const getTeamCalendar = (month: number, year: number) =>
  apiClient<LeaveItem[]>(`/leaves/team-calendar?month=${month}&year=${year}`);

export const listLeaveTypes = () => apiClient<LeaveTypeItem[]>("/leave-types");
export const createLeaveType = (payload: Partial<LeaveTypeItem> & { name: string }) =>
  apiClient<LeaveTypeItem>("/leave-types", { method: "POST", body: JSON.stringify(payload) });
export const updateLeaveType = (id: number, payload: Partial<LeaveTypeItem>) =>
  apiClient<LeaveTypeItem>(`/leave-types/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteLeaveType = (id: number) => apiClient<null>(`/leave-types/${id}`, { method: "DELETE" });

export const listLeaveBlackouts = () => apiClient<LeaveBlackout[]>("/leave-blackouts");
export const createLeaveBlackout = (payload: { name: string; start_date: string; end_date: string; leave_type_id?: number | null }) =>
  apiClient<LeaveBlackout>("/leave-blackouts", { method: "POST", body: JSON.stringify(payload) });
export const deleteLeaveBlackout = (id: number) => apiClient<null>(`/leave-blackouts/${id}`, { method: "DELETE" });

export interface EmployeeDocumentItem {
  id: number;
  employee_id: number;
  title: string;
  type?: string | null;
  visibility: "hr_only" | "manager_only" | "employee_self";
  expiry_date?: string | null;
  notes?: string | null;
  file_path?: string | null;
  employee?: { id: number; name: string } | null;
  versions?: Array<{ id: number; file_path: string; changed_by?: number | null; created_at?: string }>;
  created_at?: string;
  updated_at?: string;
}

export const listEmployeeDocuments = (filters: { employee_id?: number } = {}) => {
  const query = new URLSearchParams({ per_page: "50" });
  if (filters.employee_id !== undefined) {
    query.set("employee_id", String(filters.employee_id));
  }
  return apiClient<PaginatedResponse<EmployeeDocumentItem>>(`/employee-documents?${query.toString()}`);
};
export const getEmployeeDocument = (id: number) => apiClient<EmployeeDocumentItem>(`/employee-documents/${id}`);
export const createEmployeeDocument = (payload: FormData) => apiClient<EmployeeDocumentItem>("/employee-documents", { method: "POST", body: payload });
export const updateEmployeeDocument = (id: number, payload: FormData) => apiClient<EmployeeDocumentItem>(`/employee-documents/${id}`, { method: "PUT", body: payload });
export const deleteEmployeeDocument = (id: number) => apiClient<null>(`/employee-documents/${id}`, { method: "DELETE" });

export const previewEmployeeDocument = async (id: number) => {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE_URL}/employee-documents/${id}/preview`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Unable to preview document (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    throw new Error("Unable to open document preview window.");
  }

  try {
    previewWindow.location.href = url;
  } catch (error) {
    previewWindow.close();
    throw error;
  }
};

const parseFilename = (header: string | null) => {
  if (!header) {
    return undefined;
  }
  const match = /filename="?([^";]+)"?/.exec(header);
  return match ? match[1] : undefined;
};

export const downloadEmployeeDocument = async (id: number) => {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE_URL}/employee-documents/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Unable to download document (${response.status})`);
  }

  const blob = await response.blob();
  const filename = parseFilename(response.headers.get("Content-Disposition")) ?? `document-${id}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
