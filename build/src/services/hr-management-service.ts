import { apiClient } from "./api-client";

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
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export const listDepartments = () => apiClient<DepartmentItem[]>("/departments");
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

export const listLeaves = () => apiClient<PaginatedResponse<LeaveItem>>("/leaves?per_page=50");
export const createLeave = (payload: { employee_id: number; type: string; from_date: string; to_date: string; status?: LeaveItem["status"] }) =>
  apiClient<LeaveItem>("/leaves", { method: "POST", body: JSON.stringify(payload) });
export const updateLeave = (id: number, payload: { type?: string; from_date?: string; to_date?: string; status?: LeaveItem["status"] }) =>
  apiClient<LeaveItem>(`/leaves/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteLeave = (id: number) => apiClient<null>(`/leaves/${id}`, { method: "DELETE" });
