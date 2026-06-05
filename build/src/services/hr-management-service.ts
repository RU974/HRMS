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
  grace_minutes: number;
  is_active: boolean;
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
}

export interface LeaveItem {
  id: number;
  employee_id: number;
  type: string;
  from_date: string;
  to_date: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  employee?: { id: number; name: string } | null;
}

export interface LeaveTypeItem {
  id: number;
  name: string;
  default_days: number;
  is_paid: boolean;
  created_at?: string;
  updated_at?: string;
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
export const getDepartment = (id: number) => apiClient<DepartmentDetailItem>(`/departments/${id}`);
export const createDepartment = (payload: { name: string }) => apiClient<DepartmentItem>("/departments", { method: "POST", body: JSON.stringify(payload) });
export const updateDepartment = (id: number, payload: { name: string }) => apiClient<DepartmentItem>(`/departments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteDepartment = (id: number) => apiClient<null>(`/departments/${id}`, { method: "DELETE" });

export const listDesignations = () => apiClient<DesignationItem[]>("/designations");
export const createDesignation = (payload: { name: string }) => apiClient<DesignationItem>("/designations", { method: "POST", body: JSON.stringify(payload) });
export const updateDesignation = (id: number, payload: { name: string }) => apiClient<DesignationItem>(`/designations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteDesignation = (id: number) => apiClient<null>(`/designations/${id}`, { method: "DELETE" });

export const listShifts = () => apiClient<ShiftItem[]>("/shifts");
export const createShift = (payload: Omit<ShiftItem, "id">) => apiClient<ShiftItem>("/shifts", { method: "POST", body: JSON.stringify(payload) });
export const updateShift = (id: number, payload: Partial<Omit<ShiftItem, "id">>) => apiClient<ShiftItem>(`/shifts/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteShift = (id: number) => apiClient<null>(`/shifts/${id}`, { method: "DELETE" });

export const listHolidays = () => apiClient<HolidayItem[]>("/holidays");
export const createHoliday = (payload: Omit<HolidayItem, "id">) => apiClient<HolidayItem>("/holidays", { method: "POST", body: JSON.stringify(payload) });
export const updateHoliday = (id: number, payload: Partial<Omit<HolidayItem, "id">>) => apiClient<HolidayItem>(`/holidays/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteHoliday = (id: number) => apiClient<null>(`/holidays/${id}`, { method: "DELETE" });

export const listAttendance = () => apiClient<PaginatedResponse<AttendanceItem>>("/attendance?per_page=50");
export const createAttendance = (payload: { employee_id: number; date: string; check_in?: string | null; check_out?: string | null; status?: AttendanceItem["status"]; notes?: string | null }) =>
  apiClient<AttendanceItem>("/attendance", { method: "POST", body: JSON.stringify(payload) });
export const updateAttendance = (id: number, payload: { date?: string; check_in?: string | null; check_out?: string | null; status?: AttendanceItem["status"]; notes?: string | null }) =>
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
export const createLeave = (payload: { employee_id: number; type: string; from_date: string; to_date: string; status?: LeaveItem["status"] }) =>
  apiClient<LeaveItem>("/leaves", { method: "POST", body: JSON.stringify(payload) });
export const updateLeave = (id: number, payload: { type?: string; from_date?: string; to_date?: string; status?: LeaveItem["status"] }) =>
  apiClient<LeaveItem>(`/leaves/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteLeave = (id: number) => apiClient<null>(`/leaves/${id}`, { method: "DELETE" });

export const listLeaveTypes = () => apiClient<LeaveTypeItem[]>("/leave-types");
export const createLeaveType = (payload: { name: string; default_days: number; is_paid: boolean }) =>
  apiClient<LeaveTypeItem>("/leave-types", { method: "POST", body: JSON.stringify(payload) });
export const updateLeaveType = (id: number, payload: Partial<{ name: string; default_days: number; is_paid: boolean }>) =>
  apiClient<LeaveTypeItem>(`/leave-types/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteLeaveType = (id: number) => apiClient<null>(`/leave-types/${id}`, { method: "DELETE" });

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
  versions?: Array<{ id: number; file_path: string; changed_by?: number | null }>;
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
