# HRMS Architecture & Migration Guide

This document describes the HRMS project structure, recent architectural changes, and migration steps.

---

## Current Project Structure

```
D:\HRMS\
├── backend/                 # Laravel 12 API
│   ├── app/                # Application code
│   ├── config/
│   │   ├── cors.php        # ✅ NEW: CORS configuration (SPA)
│   │   ├── sanctum.php     # ✅ NEW: Sanctum token auth config
│   │   ├── auth.php        # Authentication guards
│   │   └── session.php     # Session settings
│   ├── routes/
│   │   └── api.php         # ✅ UPDATED: /api/v1/* only (no duplicate /api/*)
│   ├── tests/              # PHPUnit tests
│   ├── database/
│   │   ├── migrations/     # Schema files
│   │   └── seeders/        # Seed data (roles, permissions)
│   ├── .env.example        # ✅ UPDATED: Added CORS, Sanctum env vars
│   ├── artisan             # Command runner
│   └── composer.json       # PHP dependencies
│
├── build/                   # React/Vite frontend (📌 rename to 'frontend/' planned)
│   ├── src/
│   │   ├── services/
│   │   │   └── api-client.ts    # ✅ UPDATED: Prefer /api/v1
│   │   ├── modules/
│   │   ├── components/
│   │   └── store/
│   ├── vite.config.ts      # ✅ UPDATED: Proxy /api/v1
│   ├── .env.example        # ✅ UPDATED: VITE_API_BASE_URL=/api/v1
│   ├── package.json        # npm dependencies
│   └── tsconfig.json       # TypeScript config
│
├── AGENTS.md               # Coding agent guidelines
├── DEVELOPMENT.md          # 📄 NEW: Local dev setup guide
├── MIGRATION.md            # This file
└── SETTINGS_AUDIT_REPORT.md
```

---

## Recent Changes (Phase 1-7)

### ✅ Completed

#### Phase 1: Backend Config Restoration
- **Added:** [config/cors.php](backend/config/cors.php)
  - Allows SPA frontend (http://localhost:5173) to access API
  - Supports credentials (cookies for Sanctum)
  - Restricts to `/api/*` and `sanctum/csrf-cookie` paths
  
- **Added:** [config/sanctum.php](backend/config/sanctum.php)
  - Configures stateful domains for session-based token auth
  - Supports both bearer tokens and cookies

#### Phase 2: API Route Consolidation
- **Removed:** Duplicate route registration at `/api/*`
- **Kept:** Single versioned registration at `/api/v1/*`
- **Updated:** All backend tests to use `/api/v1/` prefixes
- **Result:** No route duplication, clean API versioning

#### Phase 3: Environment Variable Standardization
- **Standard:** `VITE_API_BASE_URL` (frontend)
- **Applied to:**
  - Frontend API client defaults to `/api/v1`
  - Vite dev proxy targets `/api/v1`
  - `.env.example` files updated
- **No hardcoded URLs** in production builds

#### Phase 4: Authentication Contract (role_ids)
- **Standard:** `role_ids` array in auth payloads
- **Updated:**
  - AuthController validation rules
  - Frontend forms and services
  - Test fixtures
  - User management endpoints
- **Benefit:** Consistent RBAC across entire app

#### Phase 5: CORS & Session Hardening
- Proper cookie handling for SPA
- Credentials support for token persistence
- SameSite=lax cookies for CSRF protection
- Sanctum stateful domains configured

#### Phase 6: Testing & Validation
- All 30 backend tests passing
- Auth flow tests validate token lifecycle
- CORS preflight tests validate browser compatibility
- Authorization tests ensure RBAC enforcement
- Database seeding ensures permissions exist in tests

#### Phase 7: OpenSSL Duplicate Warning
- **Issue:** `PHP Warning: Module "openssl" is already loaded`
- **Cause:** PHP configuration loads extension twice (system-level)
- **Fix:** Edit system `php.ini`, comment out duplicate entry (see [DEVELOPMENT.md](DEVELOPMENT.md#php-openssl-warning))
- **Not a project issue** — it's a local PHP setup concern

---

## Frontend Directory Structure

The React frontend is currently in `build/` but **should be renamed to `frontend/`** to match the canonical layout `/backend` and `/frontend`.

### Why?
- Consistency with industry standard (backend / frontend separation)
- Clarity in documentation and CI/CD scripts
- Avoids confusion with Vite's own `build` output directory

---

## Migration: Rename `build/` → `frontend/`

### When to Do This?
After the current dev cycle is stable or during next deployment cycle. It requires:
1. Stopping development servers
2. Updating any CI/CD pipelines
3. Updating build/run scripts

### Step-by-Step Instructions

#### On Windows (PowerShell)

```powershell
# 1. Stop all development servers and running processes
# - Close Vite dev server (Ctrl+C in terminal)
# - Close Laravel server (Ctrl+C in terminal)
# - Close any browser windows with localhost:5173
# - Stop VS Code if it has build/ folder open (or close the folder)

# 2. Navigate to project root
Set-Location -Path 'D:\HRMS'

# 3. Rename the directory
Rename-Item -Path build -NewName frontend

# 4. If rename fails (file lock), use move + remove:
#    (Skip this if rename worked)
robocopy build frontend /E /COPYALL /R:0 /W:0 | Out-Null
if (Test-Path frontend) {
    Remove-Item -Recurse -Force build
}

# 5. Verify rename succeeded
Get-ChildItem . | Where-Object { $_.Name -match '^(backend|frontend)$' }
# Output should show: backend  and  frontend (directories)
```

#### On macOS / Linux (Bash)

```bash
# 1. Stop all development servers
# - Ctrl+C in Vite terminal
# - Ctrl+C in Laravel terminal
# - Close VS Code folder

# 2. Navigate to project root
cd ~/path/to/HRMS

# 3. Rename
mv build frontend

# 4. Verify
ls -la | grep -E '^d.*(backend|frontend)$'
# Output should show: backend  and  frontend
```

### Update References After Rename

#### 1. Update Development Documentation

In [DEVELOPMENT.md](DEVELOPMENT.md), change:

```diff
- cd build
+ cd frontend
- npm run dev
+ npm run dev
```

(If you haven't renamed yet, the guide already uses generic paths where applicable.)

#### 2. Update CI/CD Pipelines

If you have GitHub Actions, GitLab CI, or similar:

```yaml
# Before
- name: Build frontend
  run: cd build && npm run build

# After
- name: Build frontend
  run: cd frontend && npm run build
```

#### 3. Update Deployment Scripts

If you have deployment shell scripts, search and replace:

```bash
# Old
SRC_DIR="./build/dist"

# New
SRC_DIR="./frontend/dist"
```

#### 4. Update VSCode Workspace Settings (if applicable)

If you have a `.vscode/settings.json` or `.code-workspace` file:

```json
{
  "folders": [
    { "path": "backend", "name": "Backend" },
    { "path": "frontend", "name": "Frontend" }
  ]
}
```

#### 5. Update README Files

Search all `*.md` files for references to `build/`:

```bash
grep -r "build/" *.md
```

Replace with `frontend/` where it refers to the React app directory.

#### 6. Update Git (if needed)

If the rename causes git issues:

```bash
# Check status
git status

# If git still shows "build/" as existing:
git add -A
git commit -m "Rename build directory to frontend"
```

---

## Environment Configuration by Stage

### Local Development

**Backend `.env`:**
```ini
APP_ENV=local
APP_DEBUG=true
DB_CONNECTION=sqlite
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

**Frontend `build/.env.local` (or `frontend/.env.local` after rename):**
```ini
VITE_API_BASE_URL=/api/v1
VITE_BACKEND_URL=http://127.0.0.1:8000
```

### Staging / Production

**Backend `.env`:**
```ini
APP_ENV=staging
APP_DEBUG=false
DB_CONNECTION=mysql
DB_HOST=staging-db.example.com
FRONTEND_URL=https://staging.example.com
CORS_ALLOWED_ORIGINS=https://staging.example.com
SANCTUM_STATEFUL_DOMAINS=staging.example.com
```

**Frontend `.env.production`:**
```ini
VITE_API_BASE_URL=/api/v1
VITE_BACKEND_URL=https://api.staging.example.com
```

---

## API Version Management

### Current State
- **Single versioned endpoint:** `/api/v1/*`
- **Root info endpoint:** `GET /api/` (returns API version info)
- **No legacy `/api/*` routes** (removed to eliminate duplication)

### Future Versioning (When Needed)

If you need to introduce breaking changes and support multiple API versions:

1. **Introduce `/api/v2/*`** in `routes/api.php`:
   ```php
   Route::prefix('v2')->group($registerRoutes);
   ```

2. **Keep `/api/v1/*` for backward compatibility** (existing clients)

3. **Update frontend to prefer v2 when ready:**
   ```
   VITE_API_BASE_URL=/api/v2
   ```

4. **Document breaking changes** for API consumers

---

## Database & Seeding

### Initial Setup
```powershell
php artisan migrate           # Create all tables
php artisan db:seed           # Populate roles, permissions, demo user
```

### Reset Database (Development Only)
```powershell
php artisan migrate:fresh --seed  # Drop all + re-migrate + seed
```

### What Gets Seeded?
- **Permissions:** 40+ domain-action pairs (employee.view, payroll.edit, etc.)
- **System Roles:** 10 roles (Super Admin, HR Manager, Payroll Manager, etc.)
- **Admin User:** Default credentials from `.env` (DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
- **Role-Permission Mappings:** Each role gets appropriate permissions

---

## Authentication Flow

### Registration
```
POST /api/v1/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "password_confirmation": "password123",
  "role_ids": ["uuid-of-employee-role"]  // ✅ NEW: role_ids array
}

Response:
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": { "id": "...", "name": "John Doe", ... },
    "token": "bearer-token-string"
  }
}
```

### Login
```
POST /api/v1/auth/login
{
  "email": "john@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { ... },
    "token": "bearer-token-string"
  }
}
```

### Protected Requests
```
GET /api/v1/employees
Authorization: Bearer bearer-token-string
```

---

## Testing

### Run All Tests
```powershell
php artisan test
# or
.\vendor\bin\phpunit.bat -c phpunit.xml --testdox
```

### Expected Output
```
OK (30 tests, 132 assertions)
```

### Test Categories
1. **Auth Flow Tests** – Register, login, token refresh, logout
2. **RBAC Tests** – Employees cannot access manager routes, etc.
3. **CRUD Tests** – Bonus, leave, attendance operations
4. **CORS Tests** – Preflight requests work correctly
5. **Report Tests** – Dashboard and reporting endpoints

---

## Security Checklist

- [x] CORS configured restrictively (only frontend URL allowed)
- [x] Sanctum properly configured (stateful + token auth)
- [x] CSRF protection via `VerifyCsrfToken` middleware
- [x] Session cookies set `HttpOnly` and `SameSite=Lax`
- [x] No sensitive data in auth tokens (JWT alternative: implement if needed)
- [x] Role-based access control (RBAC) enforced via middleware
- [x] Database credentials not in version control (`.env` in `.gitignore`)
- [ ] HTTPS enforced in production (configure web server)
- [ ] Rate limiting on auth endpoints (optional: add throttle middleware)

---

## Troubleshooting

### Issue: Tests Fail with "Table Not Found"
**Solution:**
```powershell
php artisan migrate:fresh --env=testing
php artisan test
```

### Issue: CORS Errors in Browser
**Solution:**
1. Ensure backend running: `php artisan serve`
2. Check `CORS_ALLOWED_ORIGINS` in `.env` includes frontend URL
3. Check frontend `.env.local` has correct `VITE_BACKEND_URL`
4. Clear browser cache (Ctrl+Shift+Delete)

### Issue: Port 8000 Already in Use
**Solution:**
```powershell
php artisan serve --port=8001
```

### Issue: Frontend Cannot Build
**Solution:**
```powershell
cd build  # or 'cd frontend' after rename
rm -r node_modules package-lock.json
npm install
npm run build
```

---

## Next Steps

1. **Run Local Dev:**
   - Follow [DEVELOPMENT.md](DEVELOPMENT.md)
   - Start backend: `php artisan serve`
   - Start frontend: `npm run dev` (from `build/`)
   - Visit http://localhost:5173

2. **Test the App:**
   - Register a new user
   - Log in
   - Create/view employees, leave requests, etc.
   - Run test suite: `php artisan test`

3. **Plan the `build/` → `frontend/` Rename:**
   - Follow instructions in this document
   - Update CI/CD pipelines
   - Test thoroughly before deploying

4. **Deploy:**
   - Build backend: `php artisan migrate --force`
   - Build frontend: `npm run build` (output to `dist/`)
   - Upload to production server

---

## Questions?

Refer to:
- [DEVELOPMENT.md](DEVELOPMENT.md) for local setup
- [AGENTS.md](AGENTS.md) for code contribution guidelines
- Backend tests in `backend/tests/Feature/` for API examples
- Frontend code in `build/src/` for UI/UX patterns
