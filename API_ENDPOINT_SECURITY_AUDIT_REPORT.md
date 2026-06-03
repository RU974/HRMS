# API Endpoint Security Audit Report

Scope: `backend/routes/api.php` and the matching controllers under `backend/app/Http/Controllers`.

Method:
- Reviewed the live route inventory with `php artisan route:list --json`.
- Checked controller authorization, tenant isolation, and ownership checks before changing code.
- Fixed only verified gaps.

## Summary

The API is globally protected by `auth:sanctum` for non-public routes, and most CRUD controllers already enforce permission checks or ownership rules correctly.

Verified gaps found:
- `BranchController` allowed company-admin users to read and mutate branches belonging to other companies.
- `CompanySettingsController` allowed company-admin users to read and mutate other companies’ records.
- `SystemLogController` returned audit logs across company boundaries for users with `view audit logs`.

Fixes applied:
- Scoped branch reads and mutations to the authenticated user’s `company_id` when present.
- Scoped company settings reads and mutations to the authenticated user’s `company_id` when present.
- Scoped audit log listing and record lookup to the authenticated user’s company through the related `user.company_id`.

## Route-Level Protection

The following route groups are protected by authenticated middleware:
- `auth:sanctum`
- `audit.log`

Public API routes remain limited to the intentional auth endpoints:
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

## Confirmed Findings

1. `BranchController` lacked company isolation.
- A company-admin user with `manage settings` could list, view, update, and delete branches from another company.
- `store()` also accepted arbitrary `company_id` values.

Affected endpoints:
- `GET /api/v1/settings/branches`
- `GET /api/v1/settings/branches/{id}`
- `POST /api/v1/settings/branches`
- `PUT /api/v1/settings/branches/{id}`
- `DELETE /api/v1/settings/branches/{id}`

2. `CompanySettingsController` lacked company isolation.
- A company-admin user with `manage settings` could list, view, update, and delete company records outside their own tenant.
- `store()` created a new company record even when the caller already belonged to a company.

Affected endpoints:
- `GET /api/v1/settings/companies`
- `GET /api/v1/settings/companies/{id}`
- `POST /api/v1/settings/companies`
- `PUT /api/v1/settings/companies/{id}`
- `DELETE /api/v1/settings/companies/{id}`

3. `SystemLogController` exposed cross-company audit logs.
- `index()` and `show()` returned audit records for all users, regardless of the caller’s company.
- Company-admin users with `view audit logs` could read other tenants’ audit history.

Affected endpoints:
- `GET /api/v1/settings/system-logs`
- `GET /api/v1/settings/system-logs/{id}`

## Regression Coverage Added

- Branch listing and branch mutations now deny cross-company access.
- Company listing and company mutations now deny cross-company access.
- Audit log listing and lookup now only return logs tied to the caller’s company.

## Residual Risk

- Global admin behavior remains unchanged when the authenticated user has no `company_id`.
- I did not rename routes, change payload shapes, or alter existing module contracts.
- Public auth endpoints remain intentionally public to preserve login, registration, forgot-password, and reset-password flows.
