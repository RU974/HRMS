# AGENTS.md

Repository guidance for coding agents working in the HRMS repository.

**Metadata**

- **Owner:** Engineering Team
- **Root:** repository root (use relative paths such as `backend/` and `build/`)
- **Last-updated:** 2026-10-13

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
| `recruitment/` | Overview, jobs, candidates (Kanban board + detail page with resume, notes, timeline), interviews (calendar, scorecards), offers (approval, PDF), onboarding (templates + tasks), reports |
| `careers/` | Public, unauthenticated careers site (`/careers/:slug`) with job detail and application form, and the private candidate portal (`/candidate-portal/:token`) |
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
| `ShiftController` | Shift management (edits reach today onward; `apply_from` re-judges earlier records; a shift in use cannot be deleted) |
| `ShiftScheduleController` | Roster grid (`shifts/schedule`), `my-schedule`, roster assignments (date ranges, bulk, overlap trimmed/split) and one-day overrides / days off |
| `ShiftRotationController` | Rotations: a repeating pattern of days (shift or day off) followed from an anchor date |
| `ShiftSwapController` | One-day swaps: request -> colleague accepts -> manager/HR approves -> overrides written; `shift-swaps/colleagues` for the picker |
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
| `Recruitment/JobOpeningController` | Job opening CRUD (owners, salary range, public flag) |
| `Recruitment/CandidateController` | Candidate pipeline, stage changes, hire action, board, resume, notes |
| `Recruitment/InterviewController` | Interview scheduling, conflict detection, cancel, scorecards |
| `Recruitment/OfferController` | Offer lifecycle (draft → approval → sent → accepted), PDF |
| `Recruitment/OnboardingController` | Hired-candidate onboarding records and progress |
| `Recruitment/OnboardingTaskController` | Onboarding tasks (assign, complete, skip) |
| `Recruitment/OnboardingTemplateController` | Onboarding task templates |
| `Recruitment/RecruitmentAnalyticsController` | Overview numbers and hiring analytics |
| `Recruitment/CareersSettingsController` | Public careers page settings |
| `Recruitment/CareersController` | Public careers API (no auth, rate limited) |
| `Recruitment/RecruitmentDirectoryController` | Company-scoped people picker for recruitment forms |
| `Recruitment/JobRequisitionController` | Hiring-manager endpoints to request, edit, resubmit and withdraw a job requisition |
| `Recruitment/CandidateBulkController` | Bulk candidate actions (move, reject, tag, pool, email) on ticked ids or on everything matching a filter (`select_all`, large runs report progress via `candidates/bulk-runs/{id}`), and CSV import with dry run |
| `Recruitment/CandidateDocumentController` | Staff side of candidate documents: request, upload, review, download |
| `Recruitment/CandidatePortalController` | Public candidate portal (token link): status, offer accept (emailed one-time code + consent = e-signature record) / decline, document upload, reschedule request, withdraw, messages, talent-pool consent, erase my data |
| `Recruitment/EmailTemplateController` | Saved candidate email templates (and the ready-made starter set) |
| `Recruitment/HeadcountBudgetController` | Approved headcount / new-hire budget per department and year, usage summary, live budget check for a role |
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
| `ShiftResolver` | The single answer to "which shift is this person on, on this date?": override/swap, then roster assignment (fixed shift or rotation), then the employee default. Request-scoped caches; `preload()` for bulk jobs |
| `ScheduledShift` | Result of the resolver (shift with department grace applied, working-day flag, source); also rebuilt from an attendance snapshot |
| `ShiftScheduleService` | Writes to the schedule (assign/trim, overrides, swaps) and returns warnings (rest < 8h, leave, holiday, joining date) |
| `ShiftAttendanceSync` | After a schedule change: re-syncs leave, re-captures snapshots, re-derives status, drops auto-absences on days now off, marks new absences. Never reaches past days unless asked (override on that day, `apply_from`, `apply_to_past`) |
| `ShiftNotificationService` | In-app notifications for swaps and roster changes (never throws) |
| `TaxCalculator` | Tax bracket computation |
| `ThemeSettingsService` | Theme read/write |
| `TicketNotificationService` | Ticket event notifications |
| `TicketService` | Ticket business logic |
| `UserManagementService` | User creation and management helpers |
| `WorkflowEngine` | Workflow template parsing and instantiation |
| `Recruitment/Search` | Recruitment-scoped search |
| `Recruitment/CandidateWorkflowService` | Stage rules, stage history, hire (employee + user + onboarding) |
| `Recruitment/OfferService` | Offer lifecycle, approval via `ApprovalEngine`, PDF letter |
| `Recruitment/OnboardingService` | Applies templates at hire, task status, progress sync, reminders |
| `Recruitment/RecruitmentNotificationService` | In-app recruitment notifications (never throws) |
| `Recruitment/RecruitmentAnalyticsService` | Funnel, time-to-hire, source and offer analytics |
| `Recruitment/ResumeStorageService` | Private resume storage (`local` disk, authenticated download only); parses on upload |
| `Recruitment/ResumeParserService` | Reads PDF/DOCX/DOC text and extracts name, email, phone, skills and experience (best effort, never throws) |
| `Recruitment/JobRequisitionService` | Job requisition approval via `WorkflowEngine`/`ApprovalEngine` (HR Manager step, plus a Company Admin step when over the approved headcount/budget or cost threshold), result mirrored onto the job |
| `Recruitment/CandidatePortalService` | Issues hashed-token portal links and builds the candidate-safe portal view; offer answers |
| `Recruitment/CandidateDocumentService` | Requested/uploaded candidate documents on the private disk |
| `Recruitment/DuplicateCandidateService` | Same person across jobs (matching email or normalised phone, per company) |
| `Recruitment/TalentPoolService` | Silver-medalist / general talent pool, consent (granted / declined) and retention expiry, matches for new openings, and putting a pool candidate forward for another job |
| `Recruitment/CandidateBulkService` / `CandidateImportService` | Per-candidate bulk actions with partial-success reporting; CSV import |
| `Recruitment/CandidateMailer` | Plain-text candidate email with `{{name}}`, `{{first_name}}`, `{{job}}`, `{{company}}` placeholders (failures are logged, never thrown) |
| `Recruitment/CandidateFilter` | The single place candidate-list filters become query constraints (table, board and "select everything matching") |
| `Recruitment/CandidateBulkRunService` | Resolves a filter-wide selection on the server, runs it inline (<=200) or as a recorded run finished after the response (`RunCandidateBulkAction`) |
| `Recruitment/FitScoringService` | Scores a resume against a job's requirements (skills 70 / experience 30), stores `fit_score` + breakdown, suggests talent-pool people for an opening |
| `Recruitment/DuplicateMergeService` | Folds duplicate applications into one record (interviews, notes, documents, offers, history, messages move over) |
| `Recruitment/CandidateMessageService` | Candidate <-> team message thread on the candidate record |
| `Recruitment/InterviewRescheduleService` | Candidate reschedule requests; moving the interview answers them and emails the new time |
| `Recruitment/CandidateWithdrawalService` | Candidate withdraws: rejected with a "withdrawn" reason, interviews cancelled, offers withdrawn |
| `Recruitment/OfferSigningService` | E-signature evidence for portal acceptance: emailed code, typed name, consent text, IP/user agent, document fingerprint; freezes the signed PDF and seals the record with an HMAC so `verify()` (`GET offers/{id}/signature-verification`) detects any later change. Auditable, not a certified signature |
| `Recruitment/HeadcountService` | Headcount/budget usage and the budget check that decides whether a requisition also needs the Company Admin; money is converted into the company's base currency |
| `Recruitment/CurrencyService` | Company base currency and exchange rates (`recruitment/currency`); a currency with no rate is reported and escalated, never guessed |
| `Recruitment/ResumeAiExtractor` | Optional (off by default) AI second opinion for resumes the pattern parser could not follow; fills only missing name/skills/experience |
| `Recruitment/CandidateRetentionService` | Erases personal data on request or when a company's retention period passes (`recruitment:apply-retention`, daily) |

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
- Public careers routes: `/api/v1/public/careers/{slug}[/jobs/{id}[/apply]]` and `POST /api/v1/public/careers/{slug}/portal-link` — unauthenticated, throttled (`careers-read`, `careers-apply`, `portal-link`), company resolved by slug only
- Candidate portal routes: `/api/v1/public/portal/{token}[/offer|/offer-pdf|/documents[/{id}/download]]` — unauthenticated, throttled (`careers-read`, `portal-write`); the secret token (only its SHA-256 hash is stored) identifies one candidate and nothing internal (notes, ratings, scorecards, rejection reasons) is ever returned
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

## Shift scheduling

- An employee's `shift_id` is only the **default**. The effective shift for a date comes from `ShiftResolver` (override/swap > roster assignment or rotation > default). Never read `employee->shift` to judge a particular day; use `$employee->scheduleOn($date)` or, for a record, `$attendance->judgingShift()`.
- Every `attendances` row freezes the shift it was judged against in `shift_id` + `shift_snapshot` (name, times, overnight flag, grace with the department override, `is_working_day`, source). Late/early/overtime/missing-check-out read the snapshot, so editing a shift, a roster or an employee's default does not re-judge past days. Records without a snapshot (none after the backfill migration) fall back to today's schedule.
- Schedule changes reach today and later automatically. Earlier days change only on purpose: a one-day override on that date, `PUT shifts/{id}` with `apply_from`, `apply_to_past` on a roster assignment, or `attendance:recalculate-status --resnapshot`. At most 120 past days are re-judged per call.
- A rotation slot with no shift is a day off and a slot with a shift is a working day regardless of the shift's `working_days`; a fixed shift on a roster still follows its `working_days`.
- Permissions: `attendance:edit` writes rosters, rotations and overrides; reading other people's rosters needs `attendance:edit|approve|manage_settings` or being a line manager (team only); every employee can read their own `my-schedule` and ask/answer/withdraw swaps. A swap is decided by `attendance:edit`/company admin or the requester's line manager, never by the two people involved. Unsettled swaps are cancelled by `shifts:expire-swaps` (daily).

## Access control

- Recruitment uses `recruitment:view|create|edit|delete|manage_settings`, plus `recruitment:interview` and `recruitment:onboarding_task` which every role holds so people can score their own interviews and complete their own onboarding tasks (they never see other recruitment data). Offer decisions need `approvals:approve` and the HR Manager / Company Admin role.
- `recruitment:request` lets a Department Manager raise a job requisition (`/requisitions`) without any other recruitment access. When a company turns on `requisition_approval_required` (recruitment settings), every new job also goes through approval; approvers need `approvals:approve` plus the HR Manager / Company Admin role and cannot approve their own request.
- Scheduled job `recruitment:send-reminders` (hourly) sends scorecard and onboarding-task reminders and expires stale offers.
- Scheduled job `recruitment:apply-retention` (daily) lets expired talent-pool entries lapse, warns the team 14 days before, and erases rejected candidates older than the company's `candidate_retention_months`. Retention periods, the requisition cost threshold and headcount budgets are managed under `recruitment:manage_settings` (Jobs > Careers page / Headcount budgets).
- Resume parsing is pattern based and reports a confidence per field (`resume_parsed.confidence`). A guessed or missing name flags the resume (`name_unclear`). Set `RECRUITMENT_AI_PARSER=true` plus `ANTHROPIC_API_KEY` to let Anthropic's API fill gaps; this sends resume text to a third party, so it is opt-in.
- Scanned or image-only resumes (PDF, JPG, PNG) are read by `ResumeOcrService` when Tesseract (and Poppler's `pdftoppm` for PDFs) are installed; they are auto-detected on PATH or the usual install folders, or set via `RECRUITMENT_TESSERACT_PATH` / `RECRUITMENT_PDFTOPPM_PATH` / `RECRUITMENT_OCR_COMMAND`. Without them, unreadable resumes are flagged (`resume_review_reason`) rather than guessed at. The careers settings report `email_delivery: false` while `MAIL_MAILER` is `log`.

- Attendance policy (`attendance:manage_settings`, Attendance > Policy tab, `GET|PUT /attendance/policy`) is per company and covers: late-after time and manual override, half-day / absent limits for late arrival (minutes after the late cut-off), early leave (shift end minus grace, or a fixed time without a shift), minimum hours (full-day hours, half-day hours, short day counts as absent), "N lates = 1 absent", automatic absent marking, and missing punch as absent in payroll. Every rule defaults to off. `attendances.status_reason` is `policy` (half day / absent worked out from the punches, re-judged when they change), `manual` (an admin override, kept) or null. When `lates_per_absent` is set it replaces the payroll late rule (`payroll/attendance-policy`); each block costs an absent day.

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
