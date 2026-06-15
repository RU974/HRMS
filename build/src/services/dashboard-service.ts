import { apiClient } from "./api-client";

export interface DashboardSummary {
  employees: number;
  active_employees: number;
  attendance_rate: number;
  pending_leaves: number;
  pending_payrolls: number;
  monthly_payroll: number;
  month: number;
  year: number;
}

export interface DashboardTrendPoint {
  date: string;
  label: string;
  rate: number;
}

export interface DashboardSlice {
  label: string;
  value: number;
}

export interface DashboardEmployeeRow {
  id: number;
  employee_number: string;
  name: string;
  status: string;
  department: string;
  joined_at: string | null;
}

export interface PerformanceSummary {
  avg_goal_progress: number;
  open_goals: number;
  completed_goals: number;
  kpi_achievement_rate: number;
  open_appraisals: number;
}

export interface AttritionRiskEmployee {
  id: number;
  name: string;
  department: string;
  absent_days: number;
  total_days: number;
  absence_rate: number;
}

export interface DashboardInsights {
  as_of_date: string;
  attendance_trend: DashboardTrendPoint[];
  department_distribution: DashboardSlice[];
  leave_breakdown: DashboardSlice[];
  recent_employees: DashboardEmployeeRow[];
  monthly_payroll_trend: DashboardSlice[];
  headcount_trend: DashboardSlice[];
  performance_summary: PerformanceSummary | null;
  attrition_risk: AttritionRiskEmployee[];
}

export interface WorkspaceRole {
  id?: number;
  name: string;
}

export interface WorkspaceEmployee {
  id: number;
  employee_number?: string | null;
  name: string;
  email?: string | null;
  joining_date?: string | null;
  status?: string | null;
  department?: { id: number; name: string } | null;
  designation?: { id: number; name: string } | null;
  shift?: { id: number; name: string } | null;
  manager?: { id: number; name: string } | null;
}

export interface WorkspaceAttendanceRecord {
  id?: number;
  date: string;
  status: string;
  check_in?: string | null;
  check_out?: string | null;
}

export interface WorkspaceLeaveBalance {
  id: number;
  name: string;
  default_days: number;
  used_days: number;
  remaining_days: number;
  is_paid: boolean;
}

export interface WorkspaceLeaveRequest {
  id: number;
  type: string;
  from_date: string;
  to_date: string;
  status: string;
}

export interface WorkspacePayslip {
  id: number;
  slip_number: string;
  status: string;
  issue_date: string;
  file_url?: string | null;
  notes?: string | null;
  payroll?: {
    id: number;
    month: number;
    year: number;
    net_salary: number | string;
    payment_date?: string | null;
  } | null;
}

export interface WorkspaceHoliday {
  id: number;
  name: string;
  date: string;
  is_optional: boolean;
}

export interface WorkspaceAnnouncement {
  id: number;
  title: string;
  body: string;
  target: string;
  published_at: string;
}

export interface WorkspaceNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export interface WorkspaceTask {
  id: number;
  title: string;
  details: string;
  status: "open" | "completed";
}

export interface WorkspaceDashboard {
  role_key: string;
  role_name: string;
  employee: WorkspaceEmployee | null;
  attendance: {
    today: WorkspaceAttendanceRecord | null;
    recent: WorkspaceAttendanceRecord[];
  };
  leave: {
    balances: WorkspaceLeaveBalance[];
    recent_requests: WorkspaceLeaveRequest[];
  };
  payroll: {
    latest_payslip: WorkspacePayslip | null;
  };
  calendar: {
    upcoming_holidays: WorkspaceHoliday[];
  };
  announcements: WorkspaceAnnouncement[];
  notifications: WorkspaceNotification[];
  tasks: WorkspaceTask[];
}

export function getDashboardSummary() {
  return apiClient<DashboardSummary>("/dashboard/summary");
}

export function getDashboardInsights() {
  return apiClient<DashboardInsights>("/dashboard/insights");
}

export function getWorkspaceDashboard() {
  return apiClient<WorkspaceDashboard>("/dashboard/workspace");
}
