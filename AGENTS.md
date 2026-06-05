# AGENTS.md

Repository guidance for coding agents working in `D:\HRMS`.

## Purpose

This file defines the repository-specific conventions, priorities, and verification steps for frontend and backend work in `D:\HRMS`.

## Project Summary

- HRMS is a full-stack employee management system with a Laravel API backend and a React + Vite frontend.
- Backend features include authentication, employees, departments, designations, attendance, payroll, leaves, recruitment, performance, announcements, notifications, chat, reports, company settings, role and permission management, search, and audit logging.
- Frontend features include protected route navigation, permission guards, dashboard views, employee management, attendance tracking, payroll processing, recruitment pipelines, leave requests, performance management, communication, reporting, search, profile, and settings.
- The app uses `build/src/modules/` for feature pages and `backend/app/Http/Controllers/` for the API surface.
- The current repository state has removed all markdown files except `AGENTS.md`.

## Priority

1. Follow direct user instructions first.
2. Follow this file second.
3. Preserve existing repository conventions when neither of the above is explicit.

## Scope

- Applies to the full repository rooted at `D:\HRMS`.
- Keep edits scoped to the relevant app (`build/` or `backend/`) unless the task explicitly requires integration changes.
- Prefer incremental, reviewable changes and avoid broad refactors.
- Preserve existing API contracts, route names, and payload shapes unless the task explicitly requires a coordinated contract update.
- Do not edit generated or dependency directories manually.

## Repository Layout

- `build/`: React frontend built with Vite and TypeScript.
- `backend/`: Laravel API backend.
- Other files at repository root are primarily documentation and configuration.

## General Rules

- Never modify `build/node_modules/` or `backend/vendor/`.
- Do not use destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
- Use existing primitives, services, and helpers before introducing new abstractions.
- If unexpected repository changes appear, assume they may be user-authored or generated and avoid overwriting them unless they block the task.
- Keep changes minimal, direct, and consistent with surrounding code.

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
- React Hook Form + Zod

### Key Paths

- `build/src/main.tsx`
- `build/src/app/routes/app-routes.tsx`
- `build/src/app/layouts/app-layout.tsx`
- `build/src/modules/`
- `build/src/components/`
- `build/src/services/`
- `build/src/store/`
- `build/src/styles/theme.css`

### Conventions

- Use `@/*` imports from `build/src`.
- Prefer reusable UI primitives over new custom components.
- Use React Query for server state, cache keys, and invalidation.
- Keep list, filter, and form behavior deterministic.
- Keep role-sensitive UI behavior in sync with backend permission rules.
- Avoid dead routes, duplicate service layers, and unnecessary state duplication.
- Prefer responsive implementations that work on desktop and mobile.

### Verification

- `cd build`
- `npm.cmd run build`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint` when touching shared UI, hooks, services, or reusable modules
- Manually verify affected screens at desktop and mobile sizes when the UI changes

## Backend (`backend/`)

### Stack

- PHP `^8.2`
- Laravel `12.x`
- Laravel Sanctum authentication

### Key Paths

- `backend/routes/api.php`
- `backend/app/Http/Controllers/`
- `backend/app/Models/`
- `backend/app/Services/`
- `backend/database/migrations/`
- `backend/database/seeders/`
- `backend/tests/`

### Conventions

- Prefer `Route::apiResource(...)` for CRUD endpoints.
- Add custom endpoints only when CRUD semantics are insufficient.
- Preserve middleware and permission boundaries when extending routes.
- Validate strictly in `store` and `update`.
- Eager-load relations required by frontend tables and forms.
- Keep pagination, filter, and sort contracts explicit and stable.
- Group `orWhere` clauses inside closures to avoid query leakage.
- When adding search endpoints, validate input, scope results by permission, and return `{ success, message, data }`.

### API Contract

- Unversioned routes live under `/api/*`.
- Versioned mirror routes live under `/api/v1/*`.
- Protected routes use `auth:sanctum` and `audit.log` middleware.
- Use `{ success: true, message, data }` for successful responses.
- Use `{ success: false, message, errors }` for failures.

### Verification

- `cd backend`
- `php artisan migrate` after schema changes
- `php artisan migrate:status`
- `php -l` on edited or new PHP files if full tests are not run
- `php artisan test` for touched domains when feasible

## Access Control

- Assume role and permission restrictions on protected endpoints.
- Do not use manager-only or admin-only endpoints for employee self-service flows.
- Keep role-management and settings routes behind existing permission middleware.
- Mirror backend permission checks in frontend permission helpers, rather than duplicating ad hoc checks.
- Normalize permission keys consistently.

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
