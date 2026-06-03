# API Endpoint Security Audit

Scope: `backend/routes/api.php`, the matching controllers under `backend/app/Http/Controllers`, and the tenant-related models used by those endpoints.

Method:
- Reviewed the route table with `php artisan route:list --json`.
- Checked controller-level authorization and isolation logic before changing anything.
- Fixed only verified gaps.

## Executive Summary

Most sensitive endpoints already rely on `auth:sanctum` plus controller-level permission checks.

Phase B authentication verification result:
- All protected API endpoints are registered inside the authenticated `Route::middleware(['auth:sanctum', 'audit.log'])` group.
- The unversioned `GET /api/` banner route remains public by design and does not expose business data.
- The only public API routes are the intended authentication endpoints: `register`, `login`, `forgot-password`, and `reset-password`.
- `logout`, `me`, and `refresh` remain protected and continue to require a valid authenticated request.
- No verified authentication bypass or missing `auth` middleware gap was found in the current API route surface.

Verified gaps found:
- `DepartmentController@index` and `DepartmentController@show` were authenticated but not authorization-checked.
- `DesignationController@index` and `DesignationController@show` were authenticated but not authorization-checked.
- `DashboardController@summary` and `DashboardController@insights` returned global aggregates without company scoping.

Fixes applied:
- Added permission checks to department and designation read endpoints.
- Scoped dashboard aggregate queries to the authenticated user’s company when `company_id` is present.

## Route Inventory

### Auth

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/auth/register` | `POST` | `AuthController@register` | No | Public endpoint | None | Medium |
| `/api/v1/auth/login` | `POST` | `AuthController@login` | No | Public endpoint | None | Medium |
| `/api/v1/auth/forgot-password` | `POST` | `AuthController@forgotPassword` | No | Public endpoint | None | Medium |
| `/api/v1/auth/reset-password` | `POST` | `AuthController@resetPassword` | No | Public endpoint | None | Medium |
| `/api/v1/auth/logout` | `POST` | `AuthController@logout` | Yes | Authenticated | Session/token owner | Low |
| `/api/v1/auth/me` | `GET` | `AuthController@me` | Yes | Authenticated | Self | Low |
| `/api/v1/auth/refresh` | `POST` | `AuthController@refresh` | Yes | Authenticated | Self | Low |

### Dashboard

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/dashboard/summary` | `GET` | `DashboardController@summary` | Yes | Controller-scoped company filter | None | High |
| `/api/v1/dashboard/insights` | `GET` | `DashboardController@insights` | Yes | Controller-scoped company filter | None | High |
| `/api/v1/dashboard/workspace` | `GET` | `DashboardController@workspace` | Yes | Self-service data + role visibility | None | Medium |

### Employees

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/employees` | `GET/POST/PUT/PATCH/DELETE` | `EmployeeController@{index,store,show,update,destroy}` | Yes | Controller permission checks | `view/create/edit/delete employees` | High |
| `/api/v1/employees/search` | `GET` | `EmployeeController@search` | Yes | Controller permission checks | `view employees` | Medium |
| `/api/v1/employees/department/{departmentId}` | `GET` | `EmployeeController@getByDepartment` | Yes | Controller permission checks | `view employees` | Medium |
| `/api/v1/employees/bulk-action` | `POST` | `EmployeeController@bulkAction` | Yes | Controller permission checks | `delete employees` | High |
| `/api/v1/employees/export/csv` | `GET` | `EmployeeController@export` | Yes | Controller permission checks | `export employees` | High |
| `/api/v1/employees/{id}/set-password` | `POST` | `EmployeeController@setUserPassword` | Yes | Controller permission checks | `edit employees` | High |

### Attendance

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/attendance` | `GET/POST/PUT/PATCH/DELETE` | `AttendanceController@{index,store,show,update,destroy}` | Yes | Controller permission/self checks | `manage/approve/view attendance` | High |
| `/api/v1/attendance/employee/{employeeId}` | `GET` | `AttendanceController@getByEmployee` | Yes | Self-or-manager gate | `manage attendance` or self | High |
| `/api/v1/attendance/monthly-stats/{employeeId}/{month}/{year}` | `GET` | `AttendanceController@getMonthlyStats` | Yes | Self-or-manager gate | `manage attendance` or self | High |
| `/api/v1/attendance/company-monthly-summary` | `GET` | `AttendanceController@companyMonthlySummary` | Yes | Permission gate | `view attendance` | Medium |
| `/api/v1/attendance/policy` | `GET/PUT` | `AttendanceController@getPolicy/updatePolicy` | Yes | Permission gate | `manage attendance` | High |
| `/api/v1/attendance/check-in` | `POST` | `AttendanceController@checkIn` | Yes | Self-or-manager gate | `manage attendance` or self | High |
| `/api/v1/attendance/check-out` | `POST` | `AttendanceController@checkOut` | Yes | Self-or-manager gate | `manage attendance` or self | High |

### Leave

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/leaves` | `GET/POST/PUT/PATCH/DELETE` | `LeaveController@{index,store,show,update,destroy}` | Yes | Controller self/manager checks | `view/approve/manage/request own leave` | High |

### Payroll

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/payroll` | `GET/POST/PUT/PATCH/DELETE` | `PayrollController@{index,store,show,update,destroy}` | Yes | Controller self/manager checks | `manage/view/view own payroll` | High |
| `/api/v1/payroll/employee/{employeeId}` | `GET` | `PayrollController@getByEmployee` | Yes | Controller self-or-manager gate | `manage payroll` or `view own payroll` | High |
| `/api/v1/payroll/summary/monthly` | `GET` | `PayrollController@getMonthlySummary` | Yes | Permission gate | `view payroll` | Medium |
| `/api/v1/payroll/generate` | `POST` | `PayrollController@generatePayroll` | Yes | Permission gate | `process payroll` | High |
| `/api/v1/payroll/{id}/mark-paid` | `POST` | `PayrollController@markAsPaid` | Yes | Permission gate | `manage payroll` | High |
| `/api/v1/payroll-processings` | `GET/POST/PUT/PATCH/DELETE` | `PayrollProcessingController@resource` | Yes | Permission gate | `process payroll` | High |
| `/api/v1/payslips` | `GET/POST/PUT/PATCH/DELETE` | `PayslipController@resource` | Yes | Permission/self gate | `manage/view/view own payroll` | High |
| `/api/v1/salary-slips/from-payroll` | `POST` | `PayslipController@createFromPayroll` | Yes | Permission gate | `manage payroll` | High |
| `/api/v1/bonuses` | `GET/POST/PUT/PATCH/DELETE` | `BonusController@resource` | Yes | Permission/self gate | `manage/view/view own payroll` | High |
| `/api/v1/deductions` | `GET/POST/PUT/PATCH/DELETE` | `DeductionController@resource` | Yes | Permission/self gate | `manage/view/view own payroll` | High |

### Recruitment

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/recruitment/pipeline-summary` | `GET` | `Recruitment\CandidateController@pipelineSummary` | Yes | Permission gate | `recruitment.view` | Medium |
| `/api/v1/job-openings` | `GET/POST/PUT/PATCH/DELETE` | `Recruitment\JobOpeningController@resource` | Yes | Permission gate | `recruitment.view` | High |
| `/api/v1/candidates` | `GET/POST/PUT/PATCH/DELETE` | `Recruitment\CandidateController@resource` | Yes | Permission gate | `recruitment.view` | High |
| `/api/v1/interviews` | `GET/POST/PUT/PATCH/DELETE` | `Recruitment\InterviewController@resource` | Yes | Permission gate | `recruitment.view` | High |
| `/api/v1/onboarding` | `GET/POST/PUT/PATCH/DELETE` | `Recruitment\OnboardingController@resource` | Yes | Permission gate | `recruitment.view` | High |

### Performance

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/performance-reviews` | `GET/POST/PUT/PATCH/DELETE` | `PerformanceReviewController@resource` | Yes | Permission gate | `view/manage/edit performance` | High |
| `/api/v1/performance-kpis` | `GET/POST/PUT/PATCH/DELETE` | `PerformanceKpiController@resource` | Yes | Permission gate | `view/manage/edit performance` | High |
| `/api/v1/performance-goals` | `GET/POST/PUT/PATCH/DELETE` | `PerformanceGoalController@resource` | Yes | Permission gate | `view/manage/edit performance` | High |
| `/api/v1/performance-appraisals` | `GET/POST/PUT/PATCH/DELETE` | `PerformanceAppraisalController@resource` | Yes | Permission gate | `view/manage/edit performance` | High |
| `/api/v1/performance/meta/employees` | `GET` | `PerformanceMetaController@employees` | Yes | Permission gate | `view performance` | Medium |

### Reports

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/reports` | `GET/POST/PUT/PATCH/DELETE` | `ReportController@resource` | Yes | Controller permission checks | `view/manage reports` | High |
| `/api/v1/reports/employees` | `GET` | `ReportController@employees` | Yes | Controller permission checks | `view/manage reports` | High |
| `/api/v1/reports/attendance` | `GET` | `ReportController@attendance` | Yes | Controller permission checks | `view/manage reports` | High |
| `/api/v1/reports/leave` | `GET` | `ReportController@leave` | Yes | Controller permission checks | `view/manage reports` | High |
| `/api/v1/reports/payroll` | `GET` | `ReportController@payroll` | Yes | Controller permission checks | `view/manage reports` | High |
| `/api/v1/reports/analytics` | `GET` | `ReportController@analytics` | Yes | Controller permission checks | `view/manage reports` | High |

### Communications

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/announcements` | `GET/POST/PUT/PATCH/DELETE` | `AnnouncementController@resource` | Yes | Controller company visibility checks | Communication/announcement permissions | High |
| `/api/v1/notifications` | `GET/POST/PUT/PATCH/DELETE` | `NotificationController@resource` | Yes | Controller company/self visibility checks | Notification permissions | High |
| `/api/v1/chat-messages` | `GET/POST/PUT/PATCH/DELETE` | `ChatMessageController@resource` | Yes | Controller company/self visibility checks | Chat permissions | High |
| `/api/v1/chat-messages/users` | `GET` | `ChatMessageController@users` | Yes | Controller company filter | Chat permissions | Medium |

### Search

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/search` | `GET` | `SearchController@index` | Yes | Controller permission/self filters on categories | Mixed by category | High |

### Settings

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/settings/users` | `GET/POST/PUT/PATCH/DELETE` | `UserManagementController@resource` | Yes | Permission gate | `manage users` | High |
| `/api/v1/settings/companies` | `GET/POST/PUT/PATCH/DELETE` | `CompanySettingsController@resource` | Yes | Permission gate | `manage settings` | High |
| `/api/v1/settings/branches` | `GET/POST/PUT/PATCH/DELETE` | `BranchController@resource` | Yes | Permission gate | `manage settings` | High |
| `/api/v1/settings/themes` | `GET/POST/PUT/PATCH/DELETE` | `ThemeSettingsController@resource` | Yes | Permission gate + object ownership checks | `manage settings` | High |
| `/api/v1/settings/themes/current` | `GET/PUT/DELETE` | `ThemeSettingsController@current/save/reset` | Yes | Self/company theme scope | None | Medium |
| `/api/v1/settings/themes/company` | `GET` | `ThemeSettingsController@company` | Yes | Company scope | None | Medium |
| `/api/v1/settings/system-logs` | `GET` | `SystemLogController@index` | Yes | Dual permission gate | `manage settings` + `view audit logs` | High |
| `/api/v1/settings/system-logs/{id}` | `GET` | `SystemLogController@show` | Yes | Dual permission gate | `manage settings` + `view audit logs` | High |
| `/api/v1/me/permissions` | `GET` | `RolePermissionController@myPermissions` | Yes | Self only | None | Low |
| `/api/v1/permissions` | `GET` | `RolePermissionController@permissions` | Yes | Permission gate | `manage roles` | High |
| `/api/v1/roles` | `GET/POST/PUT/DELETE` | `RolePermissionController@roles` | Yes | Permission gate | `manage roles` | High |
| `/api/v1/users/{id}/roles*` | `GET/POST/PUT/DELETE` | `UserRoleController@*` | Yes | Permission gate | `manage roles` | High |

### Audit Logs

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/settings/system-logs` | `GET` | `SystemLogController@index` | Yes | Dual permission gate | `view audit logs` | High |
| `/api/v1/settings/system-logs/{id}` | `GET` | `SystemLogController@show` | Yes | Dual permission gate | `view audit logs` | High |

### Custom Modules

| Route | Method | Controller | Auth | Authz | Permission | Risk |
|---|---|---|---|---|---|---|
| `/api/v1/departments` | `GET/POST/PUT/PATCH/DELETE` | `DepartmentController@resource` | Yes | Read endpoints now permission-checked | `manage settings` / `manage employees` / `recruitment.view` | High |
| `/api/v1/departments/{id}/restore` | `POST` | `DepartmentController@restore` | Yes | Permission gate | `manage settings` | High |
| `/api/v1/departments/{id}/reassign-employees` | `POST` | `DepartmentController@reassignEmployees` | Yes | Permission gate | `manage employees` | High |
| `/api/v1/departments/{id}/force` | `DELETE` | `DepartmentController@forceDelete` | Yes | Permission gate | `manage settings` | High |
| `/api/v1/designations` | `GET/POST/PUT/PATCH/DELETE` | `DesignationController@resource` | Yes | Read endpoints now permission-checked | `manage settings` / `manage employees` | High |
| `/api/v1/employee-documents` | `GET/POST/PUT/PATCH/DELETE` | `EmployeeDocumentController@resource` | Yes | Controller access checks | `manage employee documents` | High |
| `/api/v1/employee-documents/{id}/preview` | `GET` | `EmployeeDocumentController@preview` | Yes | Object-level access check | `manage employee documents` / visibility | High |
| `/api/v1/employee-documents/{id}/download` | `GET` | `EmployeeDocumentController@download` | Yes | Object-level access check | `manage employee documents` / visibility | High |
| `/api/v1/holidays` | `GET/POST/PUT/PATCH/DELETE` | `HolidayController@resource` | Yes | Permission gate | `attendance.edit` | High |
| `/api/v1/shifts` | `GET/POST/PUT/PATCH/DELETE` | `ShiftController@resource` | Yes | Permission gate | `attendance.edit` | High |
| `/api/v1/leave-types` | `GET/POST/PUT/PATCH/DELETE` | `LeaveTypeController@resource` | Yes | Permission gate | `attendance.edit` | High |

## Verified Findings

1. `DepartmentController@index` and `DepartmentController@show` were exposed to any authenticated user. This was fixed by adding permission checks.
2. `DesignationController@index` and `DesignationController@show` were exposed to any authenticated user. This was fixed by adding permission checks.
3. `DashboardController@summary` and `DashboardController@insights` returned global aggregates without company scoping. This was fixed by filtering employee-linked data through the authenticated user’s `company_id`.
4. Phase B authentication review found no additional endpoints that should have been protected but were left public.

## Residual Risk

- Several other authenticated analytics/search endpoints still depend on controller-level authorization and may need tenant-scoping follow-up if the deployment uses shared database tenancy across companies.
- I did not rename routes, change payload shapes, or alter existing module contracts.
- The public auth endpoints remain intentionally public to preserve login, registration, forgot-password, and reset-password flows.
