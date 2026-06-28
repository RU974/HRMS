import { createBrowserRouter, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AppLayout } from "@/app/layouts/app-layout";
import { AuthGuard } from "@/app/guards/auth-guard";
import { PermissionGuard } from "@/app/guards/permission-guard";
import { NotFoundPage } from "@/app/error/not-found-page";
import { DashboardPage } from "@/modules/dashboard/dashboard-page";
import { EmployeesPage, EmployeeFormPage } from "@/modules/employees";
import { EmployeeDetailPage } from "@/modules/employees/pages/employee-detail-page";
import { AttendancePage, CorrectionReviewPage } from "@/modules/attendance";
import { PayrollPage } from "@/modules/payroll";
import { RecruitmentPage } from "@/modules/recruitment";
import { CandidatesPage } from "@/modules/recruitment/candidates-page";
import { InterviewsPage } from "@/modules/recruitment/interviews-page";
import { JobsPage } from "@/modules/recruitment/jobs-page";
import { OnboardingPage } from "@/modules/recruitment/onboarding-page";
import { LeavesPage } from "@/modules/leaves";
import { EmployeeDocumentsPage } from "@/modules/employee-documents";
import { DepartmentsPage } from "@/modules/departments";
import { DesignationsPage } from "@/modules/designations";
import { ShiftsPage } from "@/modules/shifts";
import { DevicesListPage, SyncLogsPage, DeviceMappingPage } from "@/modules/biometric-devices";
import { HolidaysPage } from "@/modules/holidays";
import { PerformancePage } from "@/modules/performance";
import { PerformanceReviewsPage } from "@/modules/performance/reviews-page";
import { PerformanceKpisPage } from "@/modules/performance/kpis-page";
import { PerformanceGoalsPage } from "@/modules/performance/goals-page";
import { PerformanceAppraisalsPage } from "@/modules/performance/appraisals-page";
import { PerformanceTemplatesPage } from "@/modules/performance/templates-page";
import { PerformanceTrendPage } from "@/modules/performance/trend-page";
import { AnnouncementsPage } from "@/modules/announcements";
import { NotificationsPage } from "@/modules/notifications";
import { ChatPage } from "@/modules/chat";
import { CallHistoryPage } from "@/modules/call-history/call-history-page";
import { ApprovalsPage, ApprovalDetailPage, DelegationsPage } from "@/modules/approvals";
import { WorkflowsPage } from "@/modules/workflows";
import { ReportsPage } from "@/modules/reports";
import { AttendanceReportsPage } from "@/modules/reports/attendance-reports-page";
import { EmployeeReportsPage } from "@/modules/reports/employee-reports-page";
import { LeaveReportsPage } from "@/modules/reports/leave-reports-page";
import { PayrollReportsPage } from "@/modules/reports/payroll-reports-page";
import { AnalyticsReportsPage } from "@/modules/reports/analytics-reports-page";
import { SearchPage } from "@/modules/search";
import { ProfilePage } from "@/modules/profile";
import { SettingsPage } from "@/modules/settings";
import { InventoryPage } from "@/modules/inventory";
import { TicketsPage } from "@/modules/tickets";
import { TicketDetailPage } from "@/modules/tickets/ticket-detail";
import { AuthLayout } from "@/modules/auth/auth-layout";
import { LoginPage } from "@/modules/auth/login-page";
import { RegisterPage } from "@/modules/auth/register-page";
import { ForgotPasswordPage } from "@/modules/auth/forgot-password-page";
import { ResetPasswordPage } from "@/modules/auth/reset-password-page";

function withPermission(element: ReactNode, permissions: string[]) {
  return <PermissionGuard permissions={permissions}>{element}</PermissionGuard>;
}

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AuthGuard><AppLayout /></AuthGuard>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard",                 element: <DashboardPage /> },
      { path: "profile",                   element: <ProfilePage /> },
      { path: "employees",                 element: withPermission(<EmployeesPage />,              ["employees:view", "employees:edit"]) },
      { path: "employees/new",             element: withPermission(<EmployeeFormPage />,           ["employees:create"]) },
      { path: "employees/:id",             element: withPermission(<EmployeeDetailPage />,         ["employees:view", "employees:edit"]) },
      { path: "attendance",                element: withPermission(<AttendancePage />,             ["attendance:view", "attendance:manage_settings", "attendance:approve"]) },
      { path: "attendance/corrections",    element: withPermission(<CorrectionReviewPage />,       ["attendance:approve", "attendance:manage_settings"]) },
      { path: "attendance/biometric-devices",                element: withPermission(<DevicesListPage />,    ["biometric:view"]) },
      { path: "attendance/biometric-devices/sync-logs",      element: withPermission(<SyncLogsPage />,       ["biometric:view"]) },
      { path: "attendance/biometric-devices/:id/mapping",    element: withPermission(<DeviceMappingPage />,  ["biometric:manage_mapping"]) },
      { path: "payroll",                   element: withPermission(<PayrollPage />,                ["payroll:view", "payroll:manage_settings"]) },
      { path: "recruitment",               element: withPermission(<RecruitmentPage />,            ["recruitment:view"]) },
      { path: "recruitment/jobs",          element: withPermission(<JobsPage />,                  ["recruitment:view"]) },
      { path: "recruitment/candidates",    element: withPermission(<CandidatesPage />,            ["recruitment:view"]) },
      { path: "recruitment/interviews",    element: withPermission(<InterviewsPage />,            ["recruitment:view"]) },
      { path: "recruitment/onboarding",    element: withPermission(<OnboardingPage />,            ["recruitment:view"]) },
      { path: "leaves",                    element: withPermission(<LeavesPage />,                ["leaves:view", "leaves:approve", "leaves:create"]) },
      { path: "approvals",                 element: withPermission(<ApprovalsPage />,             ["approvals:view", "approvals:manage_settings", "approvals:approve"]) },
      { path: "approvals/delegations",     element: withPermission(<DelegationsPage />,           ["approvals:approve"]) },
      { path: "approvals/:id",             element: withPermission(<ApprovalDetailPage />,        ["approvals:view", "approvals:manage_settings", "approvals:approve"]) },
      { path: "workflows",                 element: withPermission(<WorkflowsPage />,             ["approvals:manage_settings"]) },
      { path: "employee-documents",        element: withPermission(<EmployeeDocumentsPage />, ["documents:view", "documents:edit"]) },
      { path: "departments",               element: withPermission(<DepartmentsPage />,           ["settings:manage_settings"]) },
      { path: "designations",              element: withPermission(<DesignationsPage />,          ["settings:manage_settings"]) },
      { path: "shifts",                    element: withPermission(<ShiftsPage />,                ["attendance:edit"]) },
      { path: "holidays",                  element: withPermission(<HolidaysPage />,              ["attendance:edit"]) },
      { path: "performance",               element: withPermission(<PerformancePage />,           ["performance:view", "performance:manage_settings"]) },
      { path: "performance/reviews",       element: withPermission(<PerformanceReviewsPage />,    ["performance:view", "performance:manage_settings"]) },
      { path: "performance/kpis",          element: withPermission(<PerformanceKpisPage />,       ["performance:view", "performance:manage_settings"]) },
      { path: "performance/goals",         element: withPermission(<PerformanceGoalsPage />,      ["performance:view", "performance:manage_settings"]) },
      { path: "performance/appraisals",    element: withPermission(<PerformanceAppraisalsPage />, ["performance:view", "performance:manage_settings"]) },
      { path: "performance/templates",     element: withPermission(<PerformanceTemplatesPage />,  ["performance:view", "performance:manage_settings"]) },
      { path: "performance/trend",         element: withPermission(<PerformanceTrendPage />,      ["performance:view", "performance:manage_settings"]) },
      { path: "announcements",             element: withPermission(<AnnouncementsPage />,         ["announcement:view", "announcement:edit"]) },
      { path: "notifications",             element: withPermission(<NotificationsPage />,         ["notification:view", "notification:edit"]) },
      { path: "chat",                      element: withPermission(<ChatPage />,        ["chat:view", "chat:create"]) },
      { path: "call-history",              element: withPermission(<CallHistoryPage />, ["chat:view", "chat:create"]) },
      { path: "reports",                   element: withPermission(<ReportsPage />,               ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/attendance",        element: withPermission(<AttendanceReportsPage />,     ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/employees",         element: withPermission(<EmployeeReportsPage />,       ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/leave",             element: withPermission(<LeaveReportsPage />,          ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/payroll",           element: withPermission(<PayrollReportsPage />,        ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/analytics",         element: withPermission(<AnalyticsReportsPage />,      ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "search",                    element: <SearchPage /> },
      { path: "inventory",                  element: withPermission(<InventoryPage />,             ["inventory:view", "inventory:create", "inventory:edit", "inventory:manage_settings"]) },
      { path: "tickets",                   element: withPermission(<TicketsPage />,               ["tickets:view", "tickets:create", "tickets:manage_settings"]) },
      { path: "tickets/:id",               element: withPermission(<TicketDetailPage />,          ["tickets:view", "tickets:create", "tickets:manage_settings"]) },
      { path: "settings",                  element: withPermission(<SettingsPage />,              ["users:view", "settings:manage_settings"]) },

      // ── Catch-all 404 inside authenticated layout ──
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login",           element: <LoginPage /> },
      { path: "register",        element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password",  element: <ResetPasswordPage /> },
    ],
  },
  // ── Top-level 404 ──
  { path: "*", element: <NotFoundPage /> },
]);