import { createBrowserRouter, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AppLayout } from "@/app/layouts/app-layout";
import { AuthGuard } from "@/app/guards/auth-guard";
import { PermissionGuard } from "@/app/guards/permission-guard";
import { SuperAdminGuard } from "@/app/guards/role-guard";
import { DashboardPage } from "@/modules/dashboard/dashboard-page";
import { EmployeesPage, EmployeeFormPage } from "@/modules/employees";
import { EmployeeDetailPage } from "@/modules/employees/pages/employee-detail-page";
import { AttendancePage } from "@/modules/attendance";
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
import { HolidaysPage } from "@/modules/holidays";
import { PerformancePage } from "@/modules/performance";
import { PerformanceReviewsPage } from "@/modules/performance/reviews-page";
import { PerformanceKpisPage } from "@/modules/performance/kpis-page";
import { PerformanceGoalsPage } from "@/modules/performance/goals-page";
import { PerformanceAppraisalsPage } from "@/modules/performance/appraisals-page";
import { AnnouncementsPage } from "@/modules/announcements";
import { NotificationsPage } from "@/modules/notifications";
import { ChatPage } from "@/modules/chat";
import { ApprovalsPage } from "@/modules/approvals";
import { ApprovalDetailPage } from "@/modules/approvals";
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
      { path: "dashboard", element: <DashboardPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "employees", element: withPermission(<EmployeesPage />, ["view employees", "manage employees"]) },
      { path: "employees/new", element: withPermission(<EmployeeFormPage />, ["manage employees"]) },
      { path: "employees/:id", element: withPermission(<EmployeeDetailPage />, ["view employees", "manage employees"]) },
      { path: "attendance", element: withPermission(<AttendancePage />, ["view attendance", "manage attendance"]) },
      { path: "payroll", element: withPermission(<PayrollPage />, ["manage payroll", "view payroll", "view own payroll"]) },
      { path: "recruitment", element: withPermission(<RecruitmentPage />, ["recruitment.view"]) },
      { path: "recruitment/jobs", element: withPermission(<JobsPage />, ["recruitment.view"]) },
      { path: "recruitment/candidates", element: withPermission(<CandidatesPage />, ["recruitment.view"]) },
      { path: "recruitment/interviews", element: withPermission(<InterviewsPage />, ["recruitment.view"]) },
      { path: "recruitment/onboarding", element: withPermission(<OnboardingPage />, ["recruitment.view"]) },
      { path: "leaves", element: withPermission(<LeavesPage />, ["view leaves", "approve leaves", "request own leave"]) },
      { path: "approvals", element: withPermission(<ApprovalsPage />, ["approvals:view", "approvals:manage_settings", "approvals:approve"]) },
      { path: "approvals/:id", element: withPermission(<ApprovalDetailPage />, ["approvals:view", "approvals:manage_settings", "approvals:approve"]) },
      { path: "workflows", element: withPermission(<WorkflowsPage />, ["approvals:manage_settings"]) },
      { path: "employee-documents", element: <EmployeeDocumentsPage /> },
      { path: "departments", element: withPermission(<DepartmentsPage />, ["manage settings"]) },
      { path: "designations", element: withPermission(<DesignationsPage />, ["manage settings"]) },
      { path: "shifts", element: withPermission(<ShiftsPage />, ["attendance.edit"]) },
      { path: "holidays", element: withPermission(<HolidaysPage />, ["attendance.edit"]) },
      { path: "performance", element: withPermission(<PerformancePage />, ["view performance", "manage performance"]) },
      { path: "performance/reviews", element: withPermission(<PerformanceReviewsPage />, ["view performance", "manage performance"]) },
      { path: "performance/kpis", element: withPermission(<PerformanceKpisPage />, ["view performance", "manage performance"]) },
      { path: "performance/goals", element: withPermission(<PerformanceGoalsPage />, ["view performance", "manage performance"]) },
      { path: "performance/appraisals", element: withPermission(<PerformanceAppraisalsPage />, ["view performance", "manage performance"]) },
      { path: "announcements", element: withPermission(<AnnouncementsPage />, ["view announcements", "manage announcements"]) },
      { path: "notifications", element: withPermission(<NotificationsPage />, ["view notifications", "manage notifications"]) },
      { path: "chat", element: <ChatPage /> },
      { path: "reports", element: withPermission(<ReportsPage />, ["view reports", "manage reports"]) },
      { path: "reports/attendance", element: withPermission(<AttendanceReportsPage />, ["view reports", "manage reports"]) },
      { path: "reports/employees", element: withPermission(<EmployeeReportsPage />, ["view reports", "manage reports"]) },
      { path: "reports/leave", element: withPermission(<LeaveReportsPage />, ["view reports", "manage reports"]) },
      { path: "reports/payroll", element: withPermission(<PayrollReportsPage />, ["view reports", "manage reports"]) },
      { path: "reports/analytics", element: withPermission(<AnalyticsReportsPage />, ["view reports", "manage reports"]) },
      { path: "search", element: <SearchPage /> },
      { path: "settings", element: withPermission(<SettingsPage />, ["manage users", "user.manage", "manage roles", "manage settings"]) },
    ],
  },
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
    ],
  },
]);