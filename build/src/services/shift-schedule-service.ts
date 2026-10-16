import { apiClient } from "./api-client";

/** One day of one person's schedule, as the backend's ShiftResolver worked it out. */
export interface ScheduleCell {
  shift_id: number | null;
  name: string | null;
  start_time: string | null;
  end_time: string | null;
  overnight: boolean;
  /** False on a weekly off or a day off in a roster / rotation / override. */
  working: boolean;
  source: "default" | "roster" | "rotation" | "override" | "swap" | "none";
  source_id: number | null;
  on_leave?: boolean;
}

export interface ScheduleRow {
  id: number;
  name: string;
  department_id: number | null;
  department: string | null;
  default_shift_id: number | null;
  days: Record<string, ScheduleCell>;
}

export interface ScheduleShift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  continues_after_midnight: boolean;
  is_active: boolean;
}

export type SwapStatus = "pending_peer" | "pending_approval" | "approved" | "rejected" | "cancelled";

export interface ShiftSwapItem {
  id: number;
  requester_id: number;
  counterpart_id: number;
  requester_date: string;
  counterpart_date: string;
  reason?: string | null;
  status: SwapStatus;
  decision_notes?: string | null;
  requester?: { id: number; name: string } | null;
  counterpart?: { id: number; name: string } | null;
  created_at?: string;
}

export interface ScheduleGrid {
  from: string;
  to: string;
  dates: string[];
  holidays: Record<string, string>;
  shifts: ScheduleShift[];
  employees: ScheduleRow[];
  pagination?: { page: number; per_page: number; total: number; last_page: number };
  swaps?: ShiftSwapItem[];
}

export interface RotationItem {
  id: number;
  name: string;
  is_active: boolean;
  cycle_days: number;
  slots: { position: number; shift_id: number | null }[];
  employee_count: number;
}

export interface AssignmentItem {
  id: number;
  employee_id: number;
  shift_id: number | null;
  shift_rotation_id: number | null;
  rotation_anchor_date: string | null;
  starts_on: string;
  ends_on: string | null;
  notes?: string | null;
  employee?: { id: number; name: string } | null;
  shift?: { id: number; name: string } | null;
  rotation?: { id: number; name: string } | null;
}

export interface WriteResult {
  warnings?: string[];
  skipped?: string[];
  saved?: number;
  replaced?: number;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const getRoster = (params: { from: string; to: string; department_id?: number; search?: string; page?: number; per_page?: number }) =>
  apiClient<ScheduleGrid>(`/shifts/schedule${qs(params)}`);

export const getMySchedule = (params: { from: string; to: string }) => apiClient<ScheduleGrid>(`/my-schedule${qs(params)}`);

export const listAssignments = (params: { employee_id?: number; current?: boolean } = {}) =>
  apiClient<AssignmentItem[]>(`/shifts/assignments${qs({ employee_id: params.employee_id, current: params.current ? 1 : undefined })}`);

export const createAssignment = (payload: {
  employee_ids: number[];
  shift_id?: number | null;
  shift_rotation_id?: number | null;
  rotation_anchor_date?: string | null;
  starts_on: string;
  ends_on?: string | null;
  notes?: string | null;
  apply_to_past?: boolean;
}) => apiClient<WriteResult>("/shifts/assignments", { method: "POST", body: JSON.stringify(payload) });

export const updateAssignment = (id: number, payload: { starts_on?: string; ends_on?: string | null; notes?: string | null; apply_to_past?: boolean }) =>
  apiClient<unknown>(`/shifts/assignments/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteAssignment = (id: number) => apiClient<unknown>(`/shifts/assignments/${id}`, { method: "DELETE" });

export const createOverride = (payload: { employee_ids: number[]; dates: string[]; shift_id?: number | null; day_off?: boolean; reason?: string | null }) =>
  apiClient<WriteResult>("/shifts/overrides", { method: "POST", body: JSON.stringify(payload) });

export const deleteOverride = (id: number) => apiClient<unknown>(`/shifts/overrides/${id}`, { method: "DELETE" });

export const listRotations = () => apiClient<RotationItem[]>("/shift-rotations");
export const createRotation = (payload: { name: string; is_active?: boolean; slots: { shift_id: number | null }[] }) =>
  apiClient<RotationItem>("/shift-rotations", { method: "POST", body: JSON.stringify(payload) });
export const updateRotation = (id: number, payload: { name?: string; is_active?: boolean; slots?: { shift_id: number | null }[] }) =>
  apiClient<RotationItem>(`/shift-rotations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteRotation = (id: number) => apiClient<null>(`/shift-rotations/${id}`, { method: "DELETE" });

export const listSwaps = (scope: "mine" | "all" | "pending" = "mine") => apiClient<ShiftSwapItem[]>(`/shift-swaps${qs({ scope })}`);
export const requestSwap = (payload: { counterpart_id: number; requester_date: string; counterpart_date?: string; reason?: string | null; requester_id?: number; auto_approve?: boolean }) =>
  apiClient<ShiftSwapItem>("/shift-swaps", { method: "POST", body: JSON.stringify(payload) });
export const respondToSwap = (id: number, accept: boolean, notes?: string) =>
  apiClient<ShiftSwapItem>(`/shift-swaps/${id}/respond`, { method: "POST", body: JSON.stringify({ accept, notes }) });
export const decideSwap = (id: number, approve: boolean, notes?: string) =>
  apiClient<ShiftSwapItem>(`/shift-swaps/${id}/decide`, { method: "POST", body: JSON.stringify({ approve, notes }) });
export const cancelSwap = (id: number) => apiClient<ShiftSwapItem>(`/shift-swaps/${id}/cancel`, { method: "POST" });

export const listColleagues = (all = false) =>
  apiClient<{ id: number; name: string; department_id: number | null }[]>(`/shift-swaps/colleagues${all ? "?all=1" : ""}`);
