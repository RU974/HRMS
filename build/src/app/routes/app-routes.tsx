import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/app/layouts/app-layout";
import { AuthGuard } from "@/app/guards/auth-guard";
import { DashboardPage } from "@/modules/dashboard/dashboard-page";
import { EmployeesPage } from "@/modules/employees";
import { EmployeeFormPage } from "@/modules/employees/employee-form-page";
import { AttendancePage } from "@/modules/attendance";
import { PayrollPage } from "@/modules/payroll";
import { RecruitmentPage } from "@/modules/recruitment";
import { CandidatesPage } from "@/modules/recruitment/candidates-page";
import { InterviewsPage } from "@/modules/recruitment/interviews-page";
import { JobsPage } from "@/modules/recruitment/jobs-page";
import { OnboardingPage } from "@/modules/recruitment/onboarding-page";
import { LeavesPage } from "@/modules/leaves";
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
import { ReportsPage } from "@/modules/reports";
import { AttendanceReportsPage } from "@/modules/reports/attendance-reports-page";
import { EmployeeReportsPage } from "@/modules/reports/employee-reports-page";
import { PayrollReportsPage } from "@/modules/reports/payroll-reports-page";
import { AnalyticsReportsPage } from "@/modules/reports/analytics-reports-page";
import { SearchPage } from "@/modules/search";
import { SettingsPage } from "@/modules/settings";
import { AuthLayout } from "@/modules/auth/auth-layout";
import { LoginPage } from "@/modules/auth/login-page";
import { RegisterPage } from "@/modules/auth/register-page";
import { ForgotPasswordPage } from "@/modules/auth/forgot-password-page";
import { ResetPasswordPage } from "@/modules/auth/reset-password-page";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AuthGuard><AppLayout /></AuthGuard>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "employees", element: <EmployeesPage /> },
      { path: "employees/new", element: <EmployeeFormPage /> },
      { path: "attendance", element: <AttendancePage /> },
      { path: "payroll", element: <PayrollPage /> },
      { path: "recruitment", element: <RecruitmentPage /> },
      { path: "recruitment/jobs", element: <JobsPage /> },
      { path: "recruitment/candidates", element: <CandidatesPage /> },
      { path: "recruitment/interviews", element: <InterviewsPage /> },
      { path: "recruitment/onboarding", element: <OnboardingPage /> },
      { path: "leaves", element: <LeavesPage /> },
      { path: "departments", element: <DepartmentsPage /> },
      { path: "designations", element: <DesignationsPage /> },
      { path: "shifts", element: <ShiftsPage /> },
      { path: "holidays", element: <HolidaysPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "performance/reviews", element: <PerformanceReviewsPage /> },
      { path: "performance/kpis", element: <PerformanceKpisPage /> },
      { path: "performance/goals", element: <PerformanceGoalsPage /> },
      { path: "performance/appraisals", element: <PerformanceAppraisalsPage /> },
      { path: "announcements", element: <AnnouncementsPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "reports/attendance", element: <AttendanceReportsPage /> },
      { path: "reports/employees", element: <EmployeeReportsPage /> },
      { path: "reports/payroll", element: <PayrollReportsPage /> },
      { path: "reports/analytics", element: <AnalyticsReportsPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  },
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> }
    ]
  }
]);
