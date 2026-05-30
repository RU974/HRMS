# AGENTS.md

Operational guidance for coding agents working in `D:\HRMS`.

## Priority Order

- Follow direct user instructions first.
- Follow this file next.
- Preserve existing repo conventions when neither of the above is explicit.

## Scope

- This file applies to the entire repository rooted at `D:\HRMS`.
- Keep edits scoped to the target app (`build/` or `backend/`) unless the task requires integration work.
- Prefer incremental, reviewable changes over broad refactors.
- Preserve existing API contracts, route names, and payload shapes unless the task explicitly includes coordinated contract updates.

## Repository Layout

- `build/`: React frontend built with Vite and TypeScript.
- `backend/`: Laravel API backend.
- `SETTINGS_AUDIT_REPORT.md`: reference for settings and audit behavior.

## Current App Surface

- Global search lives at `/search` in the frontend and uses `build/src/modules/search/index.tsx`.
- The navbar search input is controlled and submits to the global search route from `build/src/components/navbar/top-navbar.tsx`.
- The shared search input component is `build/src/components/forms/search-bar.tsx`.
- The frontend search API wrapper is `build/src/services/search-service.ts`.
- The backend global search endpoint is `GET /api/v1/search` handled by `backend/app/Http/Controllers/SearchController.php`.
- Keep global search results aligned with existing module routes, permissions, and payload shapes.

## Shared Rules

- Do not edit generated or dependency directories manually.
- Never modify `build/node_modules/` or `backend/vendor/`.
- Do not use destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
- Keep changes minimal, direct, and consistent with surrounding code.
- Use existing primitives, services, and helpers before introducing new abstractions.

## Frontend (`build/`)

### Stack

- React `19.x`
- Vite `8.x`
- TypeScript `6.x` in strict mode
- Tailwind CSS `4.x`
- React Router DOM `7.x`
- Zustand `5.x`
- TanStack React Query `5.x`
- Framer Motion `12.x`
- Lucide React `1.x`
- React Hook Form + Zod for forms and validation

### Key Paths

- `build/src/main.tsx`: app bootstrap and providers.
- `build/src/app/routes/app-routes.tsx`: route map.
- `build/src/app/layouts/app-layout.tsx`: authenticated shell.
- `build/src/modules/`: feature modules and pages.
- `build/src/modules/search/`: global search results page.
- `build/src/components/`: reusable UI primitives.
- `build/src/components/forms/search-bar.tsx`: shared controlled search input.
- `build/src/services/`: API-facing services and contracts.
- `build/src/store/`: Zustand stores.
- `build/src/styles/theme.css`: theme tokens.

### Frontend Rules

- Use `@/*` imports from `build/src`.
- Reuse existing UI primitives before adding new patterns.
- Use React Query for server state, cache keys, and invalidation.
- Keep list, filter, and form behavior deterministic.
- Keep role-sensitive UI behavior consistent with backend permissions.
- Avoid dead routes, duplicate service layers, and unnecessary state duplication.
- Prefer responsive implementations that work at desktop and mobile widths.
- Keep global search results grouped by domain and link to the correct module route.
- Keep the navbar search submit-only and route users to `/search?q=...` instead of silently filtering local lists.

### Frontend Verification

- Run `npm.cmd run build` from `build/` after meaningful frontend changes.
- Run `npx.cmd tsc --noEmit` from `build/` after TypeScript-impacting changes.
- Run `npm.cmd run lint` when touching shared UI, hooks, services, or reusable modules.
- Verify affected screens manually at desktop and mobile sizes when the UI changes.

## Backend (`backend/`)

### Stack

- PHP `^8.2`
- Laravel `12.x`
- Laravel Sanctum for API authentication

### Key Paths

- `backend/routes/api.php`: API route registration.
- `backend/app/Http/Controllers/`: controllers.
- `backend/app/Models/`: Eloquent models.
- `backend/app/Services/`: domain and application services.
- `backend/database/migrations/`: schema history.
- `backend/database/seeders/`: seed data and role templates.
- `backend/tests/`: feature and unit tests.

### Backend Rules

- Prefer `Route::apiResource(...)` for CRUD endpoints.
- Add custom endpoints only when CRUD semantics are insufficient.
- Preserve middleware and permission boundaries when extending routes.
- Validate strictly in `store` and `update`.
- Eager-load the relations needed by frontend tables and forms.
- Keep pagination, filter, and sort contracts explicit and stable.
- Group `orWhere` clauses inside closures to prevent query leakage.
- When adding search endpoints, validate the query, scope results by permission, and return the standard `{ success, message, data }` response shape.

### API Contract

- Unversioned routes live under `/api/*`.
- Versioned mirror routes live under `/api/v1/*`.
- Protected routes use `auth:sanctum` and `audit.log` middleware.
- Success responses should use `{ success: true, message, data }`.
- Failure responses should use `{ success: false, message, errors }`.

### Backend Verification

- Run `php artisan migrate` after schema changes.
- Run `php artisan migrate:status` and confirm expected state after migration work.
- Run `php -l` on each edited or new PHP file if full tests are not run.
- Run `php artisan test` for touched domains when feasible.

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

- When working on chat or notifications, preserve the behavior in `backend/app/Models/ChatMessage.php` and `backend/app/Models/NotificationItem.php`.
- Avoid changing payload semantics for existing consumers unless frontend and backend are updated together.

## Access Control

- Assume role and permission restrictions on protected endpoints.
- Do not use manager-only or admin-only endpoints for employee self-service flows.
- For cross-role dropdown or reference data, prefer narrow meta endpoints such as `performance/meta/employees`.
- Keep settings and role-management routes behind existing permission middleware.
- For global search, only return records the current user can access or infer from self-service scope.

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

## Non-Goals

- No broad refactors unrelated to the task.
- No silent API contract changes without updating all consumers.
- No route renaming or removal without coordinated frontend and backend updates.
- No UI changes that reduce operational density or dashboard usability.
