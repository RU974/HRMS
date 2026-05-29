# HRMS Development Setup Guide

This guide provides step-by-step instructions for setting up the HRMS project locally for development on Windows, macOS, and Linux.

## Project Structure

```
HRMS/
├── backend/              # Laravel 12 API backend
├── build/                # React/Vite frontend (will be renamed to frontend/ in future)
├── AGENTS.md            # Coding agent guidelines
├── DEVELOPMENT.md       # This file
└── MIGRATION.md         # Migration guides and instructions
```

---

## Prerequisites

### Backend

- **PHP 8.2+** (8.4 recommended)
  - Download: https://www.php.net/downloads
  - Or use XAMPP: https://www.apachefriends.org/
- **Composer** (latest)
  - Download: https://getcomposer.org/
- **SQLite** (bundled with PHP) or **MySQL/MariaDB** (optional)

### Frontend

- **Node.js 18+** (LTS recommended)
  - Download: https://nodejs.org/
- **npm 8+** (comes with Node.js)

### Verification

```powershell
# Check PHP
php --version

# Check Composer
composer --version

# Check Node.js and npm
node --version
npm --version
```

---

## Backend Setup (Laravel)

### 1. Install PHP Dependencies

```powershell
cd backend
composer install
```

### 2. Environment Configuration

Copy the example environment file and configure:

```powershell
# From backend/ directory
Copy-Item .env.example .env
```

Edit `.env` with the following key values:

```ini
APP_NAME=HRMS
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000

# Database (SQLite default for local dev)
DB_CONNECTION=sqlite
DB_DATABASE=database.sqlite

# CORS and SPA settings
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173
SANCTUM_STATEFUL_DOMAINS=localhost,127.0.0.1,127.0.0.1:8000,::1

# Optional: Defaults for demo admin user
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=password
```

### 3. Generate Application Key

```powershell
php artisan key:generate
```

### 4. Run Database Migrations

```powershell
php artisan migrate
```

Migrations create all tables. Use `--fresh` to reset (deletes all data):

```powershell
php artisan migrate:fresh  # Drop all tables and re-run migrations
```

### 5. Seed Demo Data (Optional)

Populate database with demo roles, permissions, and admin user:

```powershell
php artisan db:seed --class=DatabaseSeeder
```

Or run migrations with seeding in one step:

```powershell
php artisan migrate --seed
```

This will:
- Create database schema
- Create system roles (Super Admin, HR Manager, Payroll Manager, etc.)
- Create permissions and role-permission mappings
- Create a default admin user with credentials from `.env`

### 6. Clear Caches (if needed)

```powershell
php artisan cache:clear
php artisan config:clear
php artisan route:clear
```

### 7. Start Laravel Development Server

```powershell
php artisan serve
```

The API is now available at: **http://localhost:8000**

API endpoints are prefixed with `/api/v1/`:
- Register: `POST /api/v1/auth/register`
- Login: `POST /api/v1/auth/login`
- Logout: `POST /api/v1/auth/logout`
- Get current user: `GET /api/v1/auth/me`
- Permissions: `GET /api/v1/me/permissions`

---

## Frontend Setup (React + Vite)

### 1. Install JavaScript Dependencies

```powershell
cd build
npm install
```

### 2. Environment Configuration

Create or edit `.env.local` in the `build/` directory:

```ini
VITE_API_BASE_URL=/api/v1
VITE_BACKEND_URL=http://127.0.0.1:8000
```

**Explanation:**
- `VITE_API_BASE_URL`: Base URL for API calls in the browser (uses proxy during dev)
- `VITE_BACKEND_URL`: Vite dev server proxy target

### 3. Start Development Server

```powershell
npm run dev
```

The frontend is now available at: **http://localhost:5173**

Vite automatically proxies `/api/v1` requests to the Laravel backend.

---

## Running Both Backend and Frontend

### Option 1: Two Terminal Windows (Recommended)

**Terminal 1 – Backend:**

```powershell
cd D:\HRMS\backend
php artisan serve
```

**Terminal 2 – Frontend:**

```powershell
cd D:\HRMS\build
npm run dev
```

Then visit **http://localhost:5173** in your browser.

### Option 2: Run Concurrently (Single Command)

If you have both processes installed, from the backend folder:

```powershell
# This requires npm package 'concurrently' installed in backend/
composer install  # If needed
npm install concurrently  # If needed
npm run dev:all  # Run both in parallel (if configured)
```

---

## Testing

### Run Backend Tests

```powershell
cd backend
php artisan test
```

Or with verbose output:

```powershell
.\vendor\bin\phpunit.bat -c phpunit.xml --testdox
```

**Expected Result:** 30 tests passing, all green.

### Watch Mode (Run Tests on File Changes)

```powershell
php artisan test --watch
```

### Run Specific Test

```powershell
php artisan test --filter=AuthSanctumFlowTest
```

---

## Building for Production

### Backend

No build step needed. Laravel runs directly:

```powershell
php artisan migrate --force
php artisan db:seed --force
# Then deploy `backend/` folder to production server
```

### Frontend

Build production-optimized bundles:

```powershell
cd build
npm run build
```

Output files are in `build/dist/`. The build process:
1. Bundles React and dependencies
2. Minifies and optimizes code
3. Generates source maps (if needed)
4. Creates static assets

Deploy the `dist/` folder to your web server (configured to proxy `/api/v1` to the backend).

---

## Common Development Tasks

### Create a New Migration

```powershell
php artisan make:migration create_table_name
```

### Create a New Controller

```powershell
php artisan make:controller FeatureController --model=Feature
```

### Create a New API Resource

```powershell
php artisan make:resource FeatureResource
```

### Run Linting (Frontend)

```powershell
cd build
npm run lint
```

### Format Code (Frontend)

ESLint is configured; run:

```powershell
npm run lint -- --fix
```

### Check TypeScript Issues (Frontend)

```powershell
npx tsc --noEmit
```

---

## Troubleshooting

### PHP OpenSSL Warning

If you see:

```
PHP Warning: Module "openssl" is already loaded
```

**Fix:**
1. Open your PHP configuration file (usually `C:\xampp\php\php.ini`)
2. Search for `extension=openssl` or `extension=php_openssl.dll`
3. You will find duplicate entries. Comment out one (prefix with `;`)
4. Save and restart your terminal or server

### Database Lock Error

If you get "database is locked" error:

```powershell
# Clear SQLite database and migrate fresh
Remove-Item backend/database.sqlite
php artisan migrate
```

### Port Already in Use (8000 or 5173)

**For backend (port 8000):**

```powershell
php artisan serve --port=8001  # Use a different port
```

**For frontend (port 5173):**

```powershell
npm run dev -- --port 5174  # Use a different port
```

### CORS Errors in Browser

If the frontend cannot reach the backend:

1. Ensure backend is running on **http://localhost:8000**
2. Check `build/.env.local` has correct `VITE_BACKEND_URL`
3. Verify `backend/.env` has correct `CORS_ALLOWED_ORIGINS` (should include frontend URL)
4. Clear browser cache and reload

### Tests Fail with "Table Not Found"

Tests run migrations automatically. If this fails:

```powershell
# Force fresh migration in test environment
php artisan migrate:fresh --env=testing
php artisan test
```

---

## Environment Variables Reference

### Backend (.env)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `local` | Application environment (`local`, `staging`, `production`) |
| `APP_DEBUG` | `true` | Show detailed errors (set to `false` in production) |
| `DB_CONNECTION` | `sqlite` | Database driver (`sqlite`, `mysql`, `pgsql`) |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend SPA URL for CORS |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed origins |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost,127.0.0.1,...` | Domains that can use session-based auth |

### Frontend (.env.local)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | API base URL for fetch requests |
| `VITE_BACKEND_URL` | `http://127.0.0.1:8000` | Vite dev server proxy target |

---

## Next Steps

- **Create Database:** `php artisan migrate`
- **Seed Demo Data:** `php artisan db:seed`
- **Start Backend:** `php artisan serve`
- **Start Frontend:** `npm run dev` (from `build/`)
- **Log In:** Use demo credentials from `.env` or registration page
- **Run Tests:** `php artisan test`

---

## Additional Resources

- [Laravel Documentation](https://laravel.com/docs)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [React Router](https://reactrouter.com)
- [Zustand (State Management)](https://github.com/pmndrs/zustand)
- [TanStack Query (React Query)](https://tanstack.com/query)

---

## Support

For issues or questions:
1. Check this guide's Troubleshooting section
2. Review [MIGRATION.md](MIGRATION.md) for project layout changes
3. Check backend test output: `php artisan test --verbose`
4. Check frontend console: Press `F12` in browser and check Console tab
