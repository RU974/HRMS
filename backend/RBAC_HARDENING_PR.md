Commit message
--------------
RBAC: Harden routes and standardize controller authorization

Files changed:
- routes/api.php
- app/Http/Controllers/HolidayController.php
- app/Http/Controllers/ShiftController.php
- app/Http/Controllers/LeaveTypeController.php
- app/Http/Controllers/RolePermissionController.php
- app/Http/Controllers/ThemeSettingsController.php

Summary
-------
This PR hardens authorization across the backend API by:
- Adding route-level permission middleware where appropriate.
- Removing compound `permission` middleware with `|` where it created brittle matching and relying on controller-level checks instead for fine-grained logic.
- Adding controller-level `authorizePermission()` or specialized authorize helpers to sensitive actions for defense-in-depth.

Why
---
Route middleware is useful for broad protection but compound permission strings (`permission:read|write`) led to mismatches in some test flows and made the authorization surface brittle. Controllers contain contextual logic (tenant scoping, "view own" rules) and are therefore a better place for fine-grained enforcement. The changes preserve API contracts and do not alter business logic.

Testing
-------
- Ran `php -l` on modified PHP files (no syntax errors).
- Ran the full PHPUnit suite: `./vendor/bin/phpunit` — all tests pass (44 tests, 207 assertions, OK).

Notes & Recommendations
-----------------------
- Consider adding a lightweight route-authority test to assert that every route has either route middleware or a controller-level check.
- For future changes prefer single-permission middleware entries (e.g., `permission:manage payroll`) or keep permissions on controllers.

Suggested PR body
-----------------
This PR applies RBAC hardening across the API, standardizing how permissions are enforced.

Changes include:
- Route-level permission middleware added for reports, payroll, attendance, recruitment, and communication endpoints.
- Removed brittle compound permission middleware usages; controllers enforce contextual permission decisions where needed.
- Added controller-level authorization calls to several resource controllers for defense-in-depth.

All changes are backwards-compatible with existing API contracts and verified by the backend test suite.

If you'd like, I can:
- Create the git commit and open a PR branch.
- Add a small route-authorization test to fail CI if routes lack protections.
