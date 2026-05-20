import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/app/layouts/app-layout";
import { AuthGuard } from "@/app/guards/auth-guard";
import { DashboardPage } from "@/modules/dashboard/dashboard-page";
import { EmployeesPage } from "@/modules/employees";
import { AttendancePage } from "@/modules/attendance";
import { PayrollPage } from "@/modules/payroll";
import { RecruitmentPage } from "@/modules/recruitment";
import { LeavesPage } from "@/modules/leaves";
import { DepartmentsPage } from "@/modules/departments";
import { ShiftsPage } from "@/modules/shifts";
import { HolidaysPage } from "@/modules/holidays";
import { PerformancePage } from "@/modules/performance";
import { AnnouncementsPage } from "@/modules/announcements";
import { ReportsPage } from "@/modules/reports";
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
      { path: "attendance", element: <AttendancePage /> },
      { path: "payroll", element: <PayrollPage /> },
      { path: "recruitment", element: <RecruitmentPage /> },
      { path: "leaves", element: <LeavesPage /> },
      { path: "departments", element: <DepartmentsPage /> },
      { path: "shifts", element: <ShiftsPage /> },
      { path: "holidays", element: <HolidaysPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "announcements", element: <AnnouncementsPage /> },
      { path: "reports", element: <ReportsPage /> },
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


