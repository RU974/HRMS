# AGENTS.md

Repository guidance for coding agents working in the HRMS repository.

**Metadata**

- **Owner:** Engineering Team
- **Root:** repository root (use relative paths such as `backend/` and `build/`)
- **Last-updated:** 2026-06-16

## Purpose

This document defines repository-specific conventions, priorities, verification steps, and contribution guidelines for working on the HRMS project. It is written for automated agents and human contributors who need clear, actionable rules when editing the codebase.

## Project summary

- HRMS is a full-stack employee management system with a Laravel API backend and a React + Vite frontend.
- Backend features: authentication, employees, departments, designations, attendance, payroll, leaves, recruitment, performance, announcements, notifications, chat, reports, settings, role & permission management, search, and audit logging.
- Frontend features: protected routes, permission guards, dashboard views, employee management, attendance tracking, payroll UI, recruitment pipeline pages, leave requests, performance views, communication screens, reporting, search and profile/settings pages.
- Feature pages live under `build/src/modules/`. API controllers live under `backend/app/Http/Controllers/`.

## Priority & scope

- Follow direct user instructions first, then this file.
- Keep edits limited to the relevant app (`build/` or `backend/`) unless the task requires integration work across both.
- Prefer incremental, reviewable changes and avoid broad or cosmetic refactors without approval.
- Do not modify generated or dependency directories (`build/node_modules/`, `backend/vendor/`).

## Repository layout

- `build/` — React + Vite frontend (TypeScript)
- `backend/` — Laravel API backend (PHP)
- `public/`, `resources/`, and top-level docs live at repository root

## Conventions & rules

- Use existing services, helpers, and shared primitives before creating new ones.
- Preserve API contracts, route names, and payload shapes unless coordinating frontend/back changes.
- Avoid creating duplicate service layers or dead routes.
- Write deterministic list, filter, and pagination behavior for UI tables.
- Keep role-sensitive UI behavior in sync with backend permission checks.
- When writing SQL/queries, protect against query leakage; group `orWhere` clauses and apply scopes/closures.

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
- `build/src/modules/` (feature pages)
- `build/src/components/`
- `build/src/services/`

### Frontend conventions

- Use `@/*` imports mapped to `build/src`.
- Prefer shared UI primitives and keep components small and testable.
- Use React Query for server state and cache keys.
- Validate forms using Zod and React Hook Form where applicable.

## Backend (`backend/`)

### Stack

- PHP ^8.2
- Laravel 12.x
- Laravel Sanctum for authentication

### Key paths

- `backend/routes/api.php`
- `backend/app/Http/Controllers/`
- `backend/app/Models/`
- `backend/app/Services/`
- `backend/database/migrations/`
- `backend/tests/`

### Backend conventions

- Prefer `Route::apiResource(...)` for CRUD endpoints; add custom endpoints only when required.
- Validate input strictly in `store` and `update` requests using Form Requests.
- Eager-load relations required by frontend lists to avoid N+1 queries.
- Scope queries by permission; do not expose sensitive fields in public APIs.

### API contract

- Unversioned routes: `/api/*`
- Versioned mirror: `/api/v1/*` (use only when needed)
- Protected routes: `auth:sanctum` and `audit.log` middleware
- Success response shape: `{ success: true, message: string, data: ... }`
- Error response shape: `{ success: false, message: string, errors?: ... }`

## Access control

- Assume role and permission restrictions on protected endpoints.
- Do not use manager/admin-only endpoints for employee self-service flows.
- Keep role-management and settings behind existing permission middleware.
- Mirror backend permission checks in frontend permission helpers.

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

## Non-goals

- No broad refactors without approval.
- No silent API contract changes without coordinating frontend and backend updates.
- Do not edit generated dependencies or node_modules/vendor directories.

