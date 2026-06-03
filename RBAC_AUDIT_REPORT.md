# RBAC Audit Report

This is a pre-fix audit snapshot captured before the targeted permission changes in this pass.

## Scope Audited
- Roles
- Permissions
- Middleware
- Policies
- Gates
- Service-level authorization
- Controller-level authorization
- Frontend permission checks
- Menu visibility rules
- Dashboard visibility rules

## Findings

| File | Issue | Severity | Recommended Fix |
|---|---|---:|---|
| `backend/app/Http/Controllers/ReportController.php` | Report read and mutation endpoints are protected only by `auth:sanctum`. Any authenticated user can currently list, create, update, delete, and query aggregate report data directly through the API. | High | Add explicit permission checks for report read endpoints and separate mutation checks for create/update/delete. Restrict aggregate analytics endpoints to the existing report-related permissions instead of relying on frontend route guards. |
| `backend/app/Policies/ChatMessagePolicy.php` | `view chat messages` is treated as equivalent to `manage chat messages` in `canManage()`, so a user with view-only access can update/delete company chat messages. `create()` also ignores the available `send chat messages` permission helper. | High | Separate view and management checks. Keep read access on `view chat messages`, but require `manage chat messages` for update/delete and `send chat messages` or `manage chat messages` for create. |
| `build/src/modules/reports/report-crud-section.tsx` | The report CRUD UI renders create/edit/delete controls for every report page visitor, even when the backend should treat report mutation as a higher-privilege action. | Medium | Hide mutation controls unless the current user has the report-management permission used by the backend. Preserve the read-only report listings for lower-privilege users. |
| `build/src/app/routes/app-routes.tsx` | The payroll reports route allows `view own payroll`, which is a self-service permission, even though the page queries company-wide payroll summary data. | High | Remove `view own payroll` from the payroll reports route guard so only users with company-wide payroll access can open the page. |
| `build/src/app/routes/app-routes.tsx` | The analytics reports route includes `recruitment.view`, although the analytics page does not expose recruitment data. This broadens access beyond the data being returned. | Medium | Tighten the analytics route guard to the permissions that actually govern the metrics shown on the page. |
| `backend/app/Policies/NotificationPolicy.php` | Notification management is still hardcoded to the `Super Admin` role instead of the shared permission model. This is consistent with the current UI, but it is a legacy role check that bypasses the permission abstraction used elsewhere. | Low | Keep behavior unchanged unless notification management is moved onto the standard permission model. If it is migrated later, replace the role check with the matching permission and keep super-admin fallback if needed. |
| `backend/app/Services/ScopeService.php` | Employee scoping still uses a direct `Department Manager` role check rather than a permission check. This is a legacy role-based exception rather than a permission-based rule. | Low | Leave as-is unless the scoping model is being migrated. If migrated, replace the role check with a dedicated scope permission and keep the same output. |

## Notes
- I did not find evidence that the route middleware aliases or the permission normalization helpers are broken.
- The main verified authorization gap is the report controller and the chat policy escalation path.
- Some role-based checks are intentional product rules, but they remain legacy exceptions to the permission-first model.
