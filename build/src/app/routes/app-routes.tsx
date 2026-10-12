import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, type ReactNode } from "react";
import { AppLayout } from "@/app/layouts/app-layout";
import { AuthGuard } from "@/app/guards/auth-guard";
import { PermissionGuard } from "@/app/guards/permission-guard";
import { NotFoundPage } from "@/app/error/not-found-page";
import { RouteErrorElement } from "@/app/error/route-error-element";
import { AuthLayout } from "@/modules/auth/auth-layout";

const DashboardPage = lazy(() => import("@/modules/dashboard/dashboard-page").then((m) => ({ default: m.DashboardPage })));
const EmployeesPage = lazy(() => import("@/modules/employees").then((m) => ({ default: m.EmployeesPage })));
const EmployeeFormPage = lazy(() => import("@/modules/employees").then((m) => ({ default: m.EmployeeFormPage })));
const EmployeeDetailPage = lazy(() => import("@/modules/employees/pages/employee-detail-page").then((m) => ({ default: m.EmployeeDetailPage })));
const AttendancePage = lazy(() => import("@/modules/attendance").then((m) => ({ default: m.AttendancePage })));
const CorrectionReviewPage = lazy(() => import("@/modules/attendance").then((m) => ({ default: m.CorrectionReviewPage })));
const PayrollPage = lazy(() => import("@/modules/payroll").then((m) => ({ default: m.PayrollPage })));
const RecruitmentPage = lazy(() => import("@/modules/recruitment").then((m) => ({ default: m.RecruitmentPage })));
const CandidatesPage = lazy(() => import("@/modules/recruitment/candidates-page").then((m) => ({ default: m.CandidatesPage })));
const InterviewsPage = lazy(() => import("@/modules/recruitment/interviews-page").then((m) => ({ default: m.InterviewsPage })));
const JobsPage = lazy(() => import("@/modules/recruitment/jobs-page").then((m) => ({ default: m.JobsPage })));
const OnboardingPage = lazy(() => import("@/modules/recruitment/onboarding-page").then((m) => ({ default: m.OnboardingPage })));
const CandidateDetailPage = lazy(() => import("@/modules/recruitment/candidate-detail-page").then((m) => ({ default: m.CandidateDetailPage })));
const OffersPage = lazy(() => import("@/modules/recruitment/offers-page").then((m) => ({ default: m.OffersPage })));
const RecruitmentReportsPage = lazy(() => import("@/modules/recruitment/reports-page").then((m) => ({ default: m.RecruitmentReportsPage })));
const TalentPoolPage = lazy(() => import("@/modules/recruitment/talent-pool-page").then((m) => ({ default: m.TalentPoolPage })));
const ReferralsPage = lazy(() => import("@/modules/recruitment/referrals-page").then((m) => ({ default: m.ReferralsPage })));
const ReferSomeonePage = lazy(() => import("@/modules/recruitment/refer-someone-page").then((m) => ({ default: m.ReferSomeonePage })));
const ReferenceFormPage = lazy(() => import("@/modules/careers/reference-form-page").then((m) => ({ default: m.ReferenceFormPage })));
const CandidatePortalPage = lazy(() => import("@/modules/careers/candidate-portal-page").then((m) => ({ default: m.CandidatePortalPage })));
const CareersPage = lazy(() => import("@/modules/careers/careers-page").then((m) => ({ default: m.CareersPage })));
const CareersJobPage = lazy(() => import("@/modules/careers/careers-page").then((m) => ({ default: m.CareersJobPage })));
const LeavesPage = lazy(() => import("@/modules/leaves").then((m) => ({ default: m.LeavesPage })));
const EmployeeDocumentsPage = lazy(() => import("@/modules/employee-documents").then((m) => ({ default: m.EmployeeDocumentsPage })));
const DepartmentsPage = lazy(() => import("@/modules/departments").then((m) => ({ default: m.DepartmentsPage })));
const DesignationsPage = lazy(() => import("@/modules/designations").then((m) => ({ default: m.DesignationsPage })));
const ShiftsPage = lazy(() => import("@/modules/shifts").then((m) => ({ default: m.ShiftsPage })));
const DevicesListPage = lazy(() => import("@/modules/biometric-devices").then((m) => ({ default: m.DevicesListPage })));
const SyncLogsPage = lazy(() => import("@/modules/biometric-devices").then((m) => ({ default: m.SyncLogsPage })));
const DeviceMappingPage = lazy(() => import("@/modules/biometric-devices").then((m) => ({ default: m.DeviceMappingPage })));
const HolidaysPage = lazy(() => import("@/modules/holidays").then((m) => ({ default: m.HolidaysPage })));
const PerformancePage = lazy(() => import("@/modules/performance").then((m) => ({ default: m.PerformancePage })));
const PerformanceReviewsPage = lazy(() => import("@/modules/performance/reviews-page").then((m) => ({ default: m.PerformanceReviewsPage })));
const PerformanceKpisPage = lazy(() => import("@/modules/performance/kpis-page").then((m) => ({ default: m.PerformanceKpisPage })));
const PerformanceGoalsPage = lazy(() => import("@/modules/performance/goals-page").then((m) => ({ default: m.PerformanceGoalsPage })));
const PerformanceAppraisalsPage = lazy(() => import("@/modules/performance/appraisals-page").then((m) => ({ default: m.PerformanceAppraisalsPage })));
const PerformanceTemplatesPage = lazy(() => import("@/modules/performance/templates-page").then((m) => ({ default: m.PerformanceTemplatesPage })));
const PerformanceTrendPage = lazy(() => import("@/modules/performance/trend-page").then((m) => ({ default: m.PerformanceTrendPage })));
const AnnouncementsPage = lazy(() => import("@/modules/announcements").then((m) => ({ default: m.AnnouncementsPage })));
const NotificationsPage = lazy(() => import("@/modules/notifications").then((m) => ({ default: m.NotificationsPage })));
const ChatPage = lazy(() => import("@/modules/chat").then((m) => ({ default: m.ChatPage })));
const CallHistoryPage = lazy(() => import("@/modules/call-history/call-history-page").then((m) => ({ default: m.CallHistoryPage })));
const ApprovalsPage = lazy(() => import("@/modules/approvals").then((m) => ({ default: m.ApprovalsPage })));
const ApprovalDetailPage = lazy(() => import("@/modules/approvals").then((m) => ({ default: m.ApprovalDetailPage })));
const DelegationsPage = lazy(() => import("@/modules/approvals").then((m) => ({ default: m.DelegationsPage })));
const WorkflowsPage = lazy(() => import("@/modules/workflows").then((m) => ({ default: m.WorkflowsPage })));
const ReportsPage = lazy(() => import("@/modules/reports").then((m) => ({ default: m.ReportsPage })));
const AttendanceReportsPage = lazy(() => import("@/modules/reports/attendance-reports-page").then((m) => ({ default: m.AttendanceReportsPage })));
const EmployeeReportsPage = lazy(() => import("@/modules/reports/employee-reports-page").then((m) => ({ default: m.EmployeeReportsPage })));
const LeaveReportsPage = lazy(() => import("@/modules/reports/leave-reports-page").then((m) => ({ default: m.LeaveReportsPage })));
const PayrollReportsPage = lazy(() => import("@/modules/reports/payroll-reports-page").then((m) => ({ default: m.PayrollReportsPage })));
const InventoryReportsPage = lazy(() => import("@/modules/reports/inventory-reports-page").then((m) => ({ default: m.InventoryReportsPage })));
const AnalyticsReportsPage = lazy(() => import("@/modules/reports/analytics-reports-page").then((m) => ({ default: m.AnalyticsReportsPage })));
const SearchPage = lazy(() => import("@/modules/search").then((m) => ({ default: m.SearchPage })));
const ProfilePage = lazy(() => import("@/modules/profile").then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import("@/modules/settings").then((m) => ({ default: m.SettingsPage })));
const InventoryPage = lazy(() => import("@/modules/inventory").then((m) => ({ default: m.InventoryPage })));
const TicketsPage = lazy(() => import("@/modules/tickets").then((m) => ({ default: m.TicketsPage })));
const TicketDetailPage = lazy(() => import("@/modules/tickets/ticket-detail").then((m) => ({ default: m.TicketDetailPage })));
const LoginPage = lazy(() => import("@/modules/auth/login-page").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/modules/auth/register-page").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("@/modules/auth/forgot-password-page").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/modules/auth/reset-password-page").then((m) => ({ default: m.ResetPasswordPage })));

function withPermission(element: ReactNode, permissions: string[]) {
  return <PermissionGuard permissions={permissions}>{element}</PermissionGuard>;
}

export const appRouter = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorElement />,
    element: <AuthGuard><AppLayout /></AuthGuard>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard",                 element: <DashboardPage /> },
      { path: "profile",                   element: <ProfilePage /> },
      { path: "employees",                 element: withPermission(<EmployeesPage />,              ["employees:view", "employees:edit"]) },
      { path: "employees/new",             element: withPermission(<EmployeeFormPage />,           ["employees:create"]) },
      { path: "employees/:id/edit",        element: withPermission(<EmployeeFormPage />,           ["employees:edit"]) },
      { path: "employees/:id",             element: withPermission(<EmployeeDetailPage />,         ["employees:view", "employees:edit"]) },
      { path: "attendance",                element: withPermission(<AttendancePage />,             ["attendance:view", "attendance:manage_settings", "attendance:approve"]) },
      { path: "attendance/corrections",    element: withPermission(<CorrectionReviewPage />,       ["attendance:approve", "attendance:manage_settings"]) },
      { path: "attendance/biometric-devices",                element: withPermission(<DevicesListPage />,    ["biometric:view"]) },
      { path: "attendance/biometric-devices/sync-logs",      element: withPermission(<SyncLogsPage />,       ["biometric:view"]) },
      { path: "attendance/biometric-devices/:id/mapping",    element: withPermission(<DeviceMappingPage />,  ["biometric:manage_mapping"]) },
      { path: "payroll",                   element: withPermission(<PayrollPage />,                ["payroll:view", "payroll:manage_settings"]) },
      { path: "recruitment",               element: withPermission(<RecruitmentPage />,            ["recruitment:view"]) },
      { path: "recruitment/jobs",          element: withPermission(<JobsPage />,                  ["recruitment:view", "recruitment:request"]) },
      { path: "recruitment/candidates",    element: withPermission(<CandidatesPage />,            ["recruitment:view"]) },
      { path: "recruitment/candidates/:id", element: withPermission(<CandidateDetailPage />,       ["recruitment:view"]) },
      { path: "recruitment/interviews",    element: withPermission(<InterviewsPage />,            ["recruitment:view", "recruitment:interview"]) },
      { path: "recruitment/talent-pool",    element: withPermission(<TalentPoolPage />,            ["recruitment:view"]) },
      { path: "recruitment/referrals",     element: withPermission(<ReferralsPage />,            ["recruitment:view"]) },
      { path: "recruitment/refer",         element: withPermission(<ReferSomeonePage />,         ["recruitment:refer"]) },
      { path: "recruitment/offers",        element: withPermission(<OffersPage />,                ["recruitment:view"]) },
      { path: "recruitment/onboarding",    element: withPermission(<OnboardingPage />,            ["recruitment:view", "recruitment:onboarding_task"]) },
      { path: "recruitment/reports",       element: withPermission(<RecruitmentReportsPage />,    ["recruitment:view"]) },
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
      { path: "chat/:conversationId",      element: withPermission(<ChatPage />,        ["chat:view", "chat:create"]) },
      { path: "call-history",              element: withPermission(<CallHistoryPage />, ["chat:view", "chat:create"]) },
      { path: "reports",                   element: withPermission(<ReportsPage />,               ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/attendance",        element: withPermission(<AttendanceReportsPage />,     ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/employees",         element: withPermission(<EmployeeReportsPage />,       ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/leave",             element: withPermission(<LeaveReportsPage />,          ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/payroll",           element: withPermission(<PayrollReportsPage />,        ["reports:view", "reports:manage_settings", "reports:view_own"]) },
      { path: "reports/inventory",         element: withPermission(<InventoryReportsPage />,      ["reports:view", "reports:manage_settings", "reports:view_own"]) },
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
  // Public careers site: no login, no app layout.
  { path: "/careers/:slug", errorElement: <RouteErrorElement />, element: <CareersPage /> },
  { path: "/careers/:slug/jobs/:jobId", errorElement: <RouteErrorElement />, element: <CareersJobPage /> },
  // Private page for an applicant, reached through the secret link in their email.
  { path: "/candidate-portal/:token", errorElement: <RouteErrorElement />, element: <CandidatePortalPage /> },
  // Private questionnaire for a referee, reached through the secret link in their email.
  { path: "/reference/:token", errorElement: <RouteErrorElement />, element: <ReferenceFormPage /> },
  {
    path: "/auth",
    errorElement: <RouteErrorElement />,
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
