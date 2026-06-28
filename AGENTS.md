# AGENTS.md

Repository guidance for coding agents working in the HRMS repository.

**Metadata**

- **Owner:** Engineering Team
- **Root:** repository root (use relative paths such as `backend/` and `build/`)
- **Last-updated:** 2026-06-28

## Purpose

This document defines repository-specific conventions, priorities, verification steps, and contribution guidelines for working on the HRMS project. It is written for automated agents and human contributors who need clear, actionable rules when editing the codebase.

## Project summary

HRMS is a full-stack, multi-company employee management system with a Laravel API backend, a React + Vite frontend, and a standalone Python biometric agent.

**Backend features:** authentication, multi-company isolation, employees, departments, designations, branches, attendance (with biometric sync), payroll (salary grades, increments, bonuses, deductions, loan advances, tax brackets, payslips), leaves (types, balances, blackouts, policies), recruitment (job openings, candidates, interviews, onboarding), performance (appraisals, goals, KPIs, reviews, templates), inventory (categories, items, assignments), internal ticketing system, approval workflows (multi-step, delegation, escalation), announcements, notifications (with deep links), real-time chat (conversations, messages, attachments), audio/video calls (WebRTC signalling), call history, reports & analytics, role & permission management, user management, company & theme settings, licensing, system/audit logs, and global search.

**Frontend features:** role-based dashboards (management, department-manager, employee), protected routes, permission guards, all backend feature pages, real-time chat UI, WebRTC audio/video call UI, call-history page, biometric device management UI, approval workflow builder, recruitment pipeline pages, performance workspace (appraisals, goals, KPIs, reviews, templates, trends), inventory management, internal ticket system with stats widget, reports (employee, attendance, payroll, leave, analytics), search, profile, settings (company, theme, licensing).

**Biometric agent (`biometric-agent/`):** Python script (`agent.py`) that runs on any Windows/Linux machine on the same LAN as ZKTeco fingerprint devices. Fetches attendance logs and pushes them to the HRMS API. Also supports user-sync and LAN device discovery. Scheduled via Windows Task Scheduler or cron (every 15 minutes recommended).

Feature pages live under `build/src/modules/`. API controllers live under `backend/app/Http/Controllers/`.

## Priority & scope

- Follow direct user instructions first, then this file.
- Keep edits limited to the relevant app (`build/`, `backend/`, or `biometric-agent/`) unless the task requires integration work across multiple layers.
- Prefer incremental, reviewable changes and avoid broad or cosmetic refactors without approval.
- Do not modify generated or dependency directories (`build/node_modules/`, `backend/vendor/`).

## Repository layout

```
build/              React + Vite frontend (TypeScript)
backend/            Laravel API backend (PHP)
biometric-agent/    Python biometric sync agent (ZKTeco / pyzk)
```

## Multi-company isolation

All major models carry a `company_id` column. Every query on company-scoped resources **must** be filtered by the authenticated user's company. Controllers that touch employees, departments, designations, branches, leave types, holidays, shifts, inventory, biometric devices, audit logs, and similar tables all apply a `company_id` scope. Never expose cross-company data.

## Conventions & rules

- Use existing services, helpers, and shared primitives before creating new ones.
- Preserve API contracts, route names, and payload shapes unless coordinating frontend/back changes.
- Avoid creating duplicate service layers or dead routes.
- Write deterministic list, filter, and pagination behavior for UI tables.
- Keep role-sensitive UI behavior in sync with backend permission checks.
- When writing SQL/queries, protect against query leakage; group `orWhere` clauses and apply scopes/closures.
- Group permission seeds in dedicated migration files (see `database/migrations/`); never inline permission changes in feature migrations.

## Frontend (`build/`)

### Stack

- React 19.x
- Vite 8.x
- TypeScript 6.x (strict mode)
- Tailwind CSS 4.x
- React Router DOM 7.x
- Zustand, TanStack React Query, Framer Motion, Lucide React, React Hook Form + Zod

### Key paths

- `build/src/main.tsx`
- `build/src/app/routes/app-routes.tsx`
- `build/src/app/layouts/app-layout.tsx`
- `build/src/modules/` — feature pages (one folder per domain)
- `build/src/components/` — shared UI primitives (cards, charts, modals, tables, sidebar, navbar, call, chat, etc.)
- `build/src/services/` — API service layer (one file per domain)

### Module index

| Folder | Description |
|---|---|
| `announcements/` | Announcement list and detail |
| `approvals/` | Approval inbox, delegation management, approval detail |
| `attendance/` | Attendance records page |
| `auth/` | Login, register, password reset |
| `biometric-devices/` | Device list, device form modal, employee mapping, sync logs |
| `call-history/` | Call history page |
| `chat/` | Real-time chat with conversations and messaging |
| `dashboard/` | Role-aware dashboard registry (management, dept-manager, employee) |
| `departments/` | Department CRUD |
| `designations/` | Designation CRUD |
| `employee-documents/` | Employee document upload and versioning |
| `employees/` | Employee list, detail, and form pages |
| `holidays/` | Holiday management |
| `inventory/` | Category, item, and assignment management |
| `leaves/` | Leave requests and balance management |
| `notifications/` | Notification centre |
| `payroll/` | Payroll run, salary grades, increments, bonuses, deductions, loan advances, tax brackets, payslips |
| `performance/` | Appraisals, goals, KPIs, reviews, templates, trends |
| `profile/` | Employee self-service profile |
| `recruitment/` | Job openings, candidates, interviews, onboarding pipeline |
| `reports/` | Employee, attendance, payroll, leave, and analytics report pages |
| `search/` | Global search results |
| `settings/` | Company settings and licensing tab |
| `shifts/` | Shift management |
| `tickets/` | Internal ticket creation, detail, and stats widget |
| `workflows/` | Approval workflow builder |

### Frontend conventions

- Use `@/*` imports mapped to `build/src`.
- Prefer shared UI primitives and keep components small and testable.
- Use React Query for server state and cache keys.
- Validate forms using Zod and React Hook Form where applicable.
- Real-time chat and call signalling use Laravel Reverb (WebSockets). Keep socket event names in sync with backend broadcast events.

## Backend (`backend/`)

### Stack

- PHP ^8.2
- Laravel 12.x
- Laravel Sanctum for authentication
- Laravel Reverb for WebSocket broadcasting (chat, calls, notifications)

### Key paths

- `backend/routes/api.php`
- `backend/app/Http/Controllers/`
- `backend/app/Models/`
- `backend/app/Services/`
- `backend/database/migrations/`
- `backend/tests/`

### Controller index

| Controller | Domain |
|---|---|
| `AuthController` | Login, register, password reset, token refresh, `/me` |
| `EmployeeController` | Employee CRUD, profile, promotions |
| `EmployeePromotionController` | Promotion history |
| `EmployeeDocumentController` | Document upload, versioning |
| `DepartmentController` | Department CRUD |
| `DesignationController` | Designation CRUD |
| `BranchController` | Branch CRUD |
| `AttendanceController` | Attendance records, correction requests |
| `BiometricDeviceController` | Device CRUD, agent push/sync/discovery endpoints |
| `HolidayController` | Holiday management |
| `ShiftController` | Shift management |
| `LeaveController` | Leave request CRUD |
| `LeaveTypeController` | Leave type CRUD |
| `LeaveBlackoutController` | Blackout period management |
| `PayrollController` | Payroll runs |
| `PayrollProcessingController` | Payroll processing |
| `PayslipController` | Payslip generation and download |
| `BonusController` | Bonus records |
| `DeductionController` | Deduction records |
| `SalaryGradeController` | Salary grade management |
| `SalaryIncrementController` | Salary increment records |
| `LoanAdvanceController` | Loan and advance management |
| `TaxBracketController` | Tax bracket configuration |
| `PerformanceAppraisalController` | Appraisal CRUD |
| `PerformanceGoalController` | Goal management |
| `PerformanceKpiController` | KPI tracking |
| `PerformanceReviewController` | Review cycles |
| `PerformanceReviewTemplateController` | Review templates |
| `PerformanceMetaController` | Performance meta configuration |
| `Recruitment/JobOpeningController` | Job opening CRUD |
| `Recruitment/CandidateController` | Candidate pipeline |
| `Recruitment/InterviewController` | Interview scheduling |
| `Recruitment/OnboardingController` | Onboarding tasks |
| `InventoryCategoryController` | Inventory category CRUD |
| `InventoryItemController` | Inventory item CRUD |
| `InventoryAssignmentController` | Item assignment to employees |
| `TicketController` | Internal ticket CRUD |
| `TicketCommentController` | Ticket comment CRUD |
| `TicketStatsController` | Ticket stats aggregation |
| `WorkflowController` | Approval workflow template CRUD |
| `ApprovalController` | Approval instance management |
| `ApprovalDelegationController` | Approval delegation |
| `AnnouncementController` | Announcements |
| `NotificationController` | Notifications with deep links |
| `ChatConversationController` | Chat conversation management |
| `ChatMessageController` | Chat message send/receive |
| `CallController` | WebRTC call signalling and history |
| `ReportController` | Employee, attendance, payroll, leave, analytics reports |
| `SearchController` | Global full-text search |
| `DashboardController` | Dashboard summary, insights, workspace |
| `RolePermissionController` | Role and permission management |
| `UserManagementController` | User CRUD and activation |
| `UserRoleController` | User-role assignment |
| `CompanySettingsController` | Company profile settings |
| `ThemeSettingsController` | Theme customisation |
| `LicenseController` | License validation and management |
| `SystemLogController` | System / audit log viewer |

### Service index

| Service | Responsibility |
|---|---|
| `ApprovalEngine` | Multi-step workflow execution |
| `ApprovalEscalationService` | Time-based approval escalation |
| `AttendanceCalculator` | Hours, overtime, absence calculations |
| `AuditLogService` / `AuditService` | Audit trail recording |
| `BiometricSyncService` | ZKTeco attendance data ingestion |
| `BranchService` | Branch utilities |
| `CompanySettingsService` | Company settings read/write |
| `ConditionEvaluator` | Dynamic workflow condition engine |
| `LeaveNotificationService` | Leave status notifications |
| `LeavePolicyService` | Leave policy enforcement |
| `LicenseService` | License key validation |
| `PayrollCalculator` | Gross/net pay computation |
| `PermissionService` | Permission resolution helpers |
| `ReportAnalyticsService` | Advanced analytics aggregation |
| `ReportExportService` | PDF/CSV export generation |
| `ScopeService` | Cross-module query scope utilities |
| `TaxCalculator` | Tax bracket computation |
| `ThemeSettingsService` | Theme read/write |
| `TicketNotificationService` | Ticket event notifications |
| `TicketService` | Ticket business logic |
| `UserManagementService` | User creation and management helpers |
| `WorkflowEngine` | Workflow template parsing and instantiation |
| `Recruitment/Search` | Recruitment-scoped search |

### Backend conventions

- Prefer `Route::apiResource(...)` for CRUD endpoints; add custom endpoints only when required.
- Validate input strictly in `store` and `update` requests using Form Requests.
- Eager-load relations required by frontend lists to avoid N+1 queries.
- Scope queries by permission **and** by `company_id`; do not expose sensitive fields in public APIs.
- All protected routes use both `auth:sanctum` and `audit.log` middleware.

### API contract

- Unversioned routes: `/api/*`
- Versioned mirror: `/api/v1/*` (use only when needed)
- Protected routes: `auth:sanctum` and `audit.log` middleware
- Biometric agent routes: `/api/auth/biometric-agent/*` — authenticated by shared secret (no session)
- Success response shape: `{ success: true, message: string, data: ... }`
- Error response shape: `{ success: false, message: string, errors?: ... }`

## Biometric agent (`biometric-agent/`)

- Language: Python 3.x
- Dependencies: `pyzk`, `requests`, `python-dotenv`
- Entry point: `agent.py`
- Modes: `python agent.py` (push attendance) | `--sync-users` | `--discover`
- Configuration: `.env` file (see `.env.example`)
- Designed to run every 15 minutes via Windows Task Scheduler or Linux cron
- Pushes to `POST /api/auth/biometric-agent/push`, `POST /api/auth/biometric-agent/sync-users`, `POST /api/auth/biometric-agent/discovered-devices`
- Device registration and employee mapping are managed from the HRMS web UI (biometric-devices module)

## Access control

- Assume role and permission restrictions on protected endpoints.
- Do not use manager/admin-only endpoints for employee self-service flows.
- Keep role-management and settings behind existing permission middleware.
- Mirror backend permission checks in frontend permission helpers.
- Permission seeds must be isolated in their own migration files and never destructively alter existing permission rows.

## Contribution & PR checklist

- Create a feature branch named `feat/<scope>-short-description` or `fix/<scope>-short-description`.
- Run linters and type-checkers before opening a PR.
- Add tests for backend logic and TypeScript types or unit tests for frontend code when touching behavior.
- PR description must include: what changed, why, how to test locally, and any migration steps.
- Include a small changelog entry when the change affects behavior or migrations.

PR reviewers should confirm:

- The change is scoped and incremental.
- Tests exist for new behavior and pass locally.
- No secrets or credentials were added.
- Database migrations are non-destructive or documented.
- Multi-company scoping (`company_id`) is applied wherever a model requires it.

Commit message format:

- Use conventional commits style: `type(scope): short description`
- Example: `feat(attendance): add hourly-overtime calculation`

## Verification commands

Frontend quick checks:

```powershell
cd build
npx tsc --noEmit
npm run lint
npm run build
```

Backend quick checks:

```powershell
cd backend
php -l app/Http/Controllers/YourController.php
php artisan migrate --pretend
php artisan test --filter <TestName>
```

When updating schema:

```powershell
cd backend
php artisan migrate
php artisan migrate:status
php artisan test
```

Biometric agent quick check:

```powershell
cd biometric-agent
python agent.py --discover
```

## Non-goals

- No broad refactors without approval.
- No silent API contract changes without coordinating frontend and backend updates.
- Do not edit generated dependencies or `node_modules/`/`vendor/` directories.
- Do not store secrets or API keys in source files; use `.env` files.
