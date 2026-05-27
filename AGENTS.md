# AGENTS.md

Operational guidance for coding agents working in `D:\HRMS`.

## Scope And Priorities

- Keep changes scoped to the target app (`build/` or `backend/`) unless integration is required.
- Preserve existing API contracts and route names unless the task explicitly includes coordinated contract updates.
- Favor incremental, reviewable changes over broad refactors.

## Workspace Layout

- `build/`: React frontend (Vite + TypeScript).
- `backend/`: Laravel API backend.
- `SETTINGS_AUDIT_REPORT.md`: operational reference for settings/audit behaviors.

## Frontend Stack (build/)

- React `19.x`
- Vite `8.x`
- TypeScript `6.x` (strict mode expected)
- Tailwind CSS `4.x`
- React Router DOM `7.x`
- Zustand `5.x`
- TanStack React Query `5.x`
- Framer Motion `12.x`
- Lucide React `1.x`
- React Hook Form + Zod for forms/validation

### Frontend Key Paths

- `build/src/main.tsx`: app bootstrap and providers.
- `build/src/app/routes/app-routes.tsx`: route map.
- `build/src/app/layouts/app-layout.tsx`: authenticated shell.
- `build/src/modules/`: feature modules and pages.
- `build/src/components/`: reusable UI primitives.
- `build/src/services/`: API-facing services/contracts.
- `build/src/store/`: Zustand stores.
- `build/src/styles/theme.css`: theme tokens.

### Frontend Rules

- Use `@/*` imports from `build/src`.
- Reuse existing primitives before introducing new UI patterns.
- Use React Query for server state, cache keys, and invalidation.
- Keep list/filter/form behavior deterministic and role-safe.
- Avoid introducing dead routes or duplicate service layers.

## Backend Stack (backend/)

- PHP `^8.2`
- Laravel `12.x`
- Laravel Sanctum for API auth

### Backend Key Paths

- `backend/routes/api.php`: API route registration.
- `backend/app/Http/Controllers/`: controllers.
- `backend/app/Models/`: Eloquent models.
- `backend/app/Services/`: domain/application services.
- `backend/database/migrations/`: schema history.
- `backend/database/seeders/`: seed data and role templates.
- `backend/tests/`: feature/unit tests.

Never edit generated/vendor code manually:

- `backend/vendor/`
- `build/node_modules/`

## API Topology And Contracts

Current route registration pattern in `backend/routes/api.php`:

- Unversioned routes under `/api/*`.
- Versioned mirror routes under `/api/v1/*`.
- Protected routes use `auth:sanctum` and `audit.log` middleware.

### Response Shape Standard

Keep API responses consistent with base helpers:

- Success: `{ success: true, message, data }`
- Failure: `{ success: false, message, errors }`

### Routing Rules

- Prefer `Route::apiResource(...)` for CRUD.
- Add explicit custom endpoints only when CRUD semantics are insufficient.
- Preserve middleware and permission boundaries when extending endpoints.
- Group search `orWhere` clauses inside closures to prevent query leakage.

### Query And Data Rules

- Validate strictly in `store` and `update`.
- Eager-load required relations for frontend tables/forms.
- Keep pagination/filter/sort contracts explicit and stable.

## Performance Module Contract

### Frontend

- UI route: `/performance`
- Module entry: `build/src/modules/performance/index.tsx`
- Service: `build/src/services/performance-service.ts`

### Backend Resources

- `performance-reviews`
- `performance-kpis`
- `performance-goals`
- `performance-appraisals`
- `performance/meta/employees`

### Backend Controllers

- `backend/app/Http/Controllers/PerformanceReviewController.php`
- `backend/app/Http/Controllers/PerformanceKpiController.php`
- `backend/app/Http/Controllers/PerformanceGoalController.php`
- `backend/app/Http/Controllers/PerformanceAppraisalController.php`
- `backend/app/Http/Controllers/PerformanceMetaController.php`

### Related Migration

- `backend/database/migrations/2026_05_27_232000_create_performance_tables.php`

## Communication And Notification Domain

When working on chat/notifications, review and preserve behavior in:

- `backend/app/Models/ChatMessage.php`
- `backend/app/Models/NotificationItem.php`

Avoid changing payload semantics for existing consumers unless frontend and backend are updated together.

## Access Control Rules

- Assume role/permission restrictions on most protected endpoints.
- Do not use manager/admin-only endpoints for employee self-service flows.
- For cross-role dropdown/reference needs, prefer narrow meta endpoints (for example, `performance/meta/employees`).
- Keep settings/role-management routes behind existing permission middleware.

## Recommended Commands

Frontend:

```powershell
cd build
npm.cmd run dev
npm.cmd run build
npm.cmd run lint
npx.cmd tsc --noEmit
```

Backend:

```powershell
cd backend
php artisan serve --host=127.0.0.1 --port=8000
php artisan migrate
php artisan migrate:status
php artisan db:seed --class=DatabaseSeeder
php artisan test
```

## Mandatory Verification Checklist

### After Meaningful Frontend Changes

1. Run `npm.cmd run build` from `build/`.
2. Run `npx.cmd tsc --noEmit` from `build/`.
3. Run `npm.cmd run lint` when touching shared UI, hooks, or services.
4. Verify affected screens at desktop and mobile widths.

### After Backend CRUD Or Schema Changes

1. Run `php artisan migrate` from `backend/`.
2. Run `php artisan migrate:status` and confirm expected state.
3. Run `php -l` on each edited/new PHP file if full tests are not run.
4. Run `php artisan test` for touched domains when feasible.

### After Frontend + Backend Integration Changes

1. Validate create/read/update/delete manually for each affected resource.
2. Confirm frontend payload keys match backend validation keys.
3. Confirm filters/search do not leak cross-scope records.
4. Confirm reference/meta endpoints are accessible for intended roles.
5. Test both `/api/*` and `/api/v1/*` consumers if the change is route-sensitive.

## Safety Rules

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
- Do not modify generated dependency directories.
- If sandbox/permission blocks required checks, request escalation instead of bypassing safety.

## Non-Goals

- No broad refactors unrelated to the task.
- No silent API contract changes without updating all consumers.
- No route renaming/removal without coordinated frontend/backend updates.
- No UI changes that reduce operational density or dashboard usability.
