# HRMS – Human Resource Management System

A modern, full-stack HRMS application with a Laravel REST API backend and React/Vite frontend. Designed for managing employees, payroll, leave, recruitment, performance, and organizational operations.

![Status](https://img.shields.io/badge/status-production_ready-brightgreen) ![Backend Tests](https://img.shields.io/badge/backend_tests-30_passing-brightgreen) ![License](https://img.shields.io/badge/license-proprietary-blue)

---

## Project Overview

### Tech Stack

**Backend:** Laravel 12 | PHP 8.2+ | Sanctum | MySQL/SQLite
**Frontend:** React 19 | TypeScript 6 | Vite | Tailwind CSS | Zustand | React Query
**Testing:** PHPUnit (Backend) | Vitest (Frontend, optional)
**DevOps:** GitHub Actions / GitLab CI | Docker

### Key Features

- ✅ **Employee Management** – Profiles, documents, org structure
- ✅ **Leave Management** – Requests, policies, approvals
- ✅ **Attendance Tracking** – Clock in/out, shifts, policies
- ✅ **Payroll System** – Salary processing, payslips, deductions
- ✅ **Recruitment** – Job postings, candidates, interviews
- ✅ **Performance Management** – Reviews, goals, KPIs, appraisals
- ✅ **Role-Based Access** – Granular permissions, 10+ roles
- ✅ **Audit Logging** – All changes tracked
- ✅ **Responsive UI** – Desktop and mobile layouts

### Architecture

```
HRMS/
├── backend/          Laravel API (/api/v1/*)
├── frontend/         React SPA (in build/ directory)
├── DEVELOPMENT.md    Developer setup guide
├── MIGRATION.md      Architecture & migration instructions
├── CI_BUILD.md       CI/CD pipeline configuration
└── AGENTS.md         Code contribution guidelines
```

---

## Quick Start (60 seconds)

### Backend

```powershell
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

**API available at:** http://localhost:8000/api/v1

### Frontend

```powershell
cd build
npm install
npm run dev
```

**App available at:** http://localhost:5173

**Demo credentials** (after seeding):
- Email: `admin@example.com`
- Password: `password` (configured in `.env`)

---

## Documentation

### For Developers

| Document | Purpose |
| --- | --- |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Complete setup guide for Windows/Mac/Linux, dev tasks, troubleshooting |
| [backend/README.md](backend/README.md) | Backend API overview, endpoints, testing |
| [MIGRATION.md](MIGRATION.md) | Architecture decisions, build→frontend rename guide, seeding info |
| [CI_BUILD.md](CI_BUILD.md) | GitHub Actions, GitLab CI, Docker, deployment pipelines |
| [AGENTS.md](AGENTS.md) | Code contribution guidelines, repo conventions |

### Start Here

1. **First time setting up?** → [DEVELOPMENT.md](DEVELOPMENT.md)
2. **Want to understand the architecture?** → [MIGRATION.md](MIGRATION.md)
3. **Setting up CI/CD?** → [CI_BUILD.md](CI_BUILD.md)
4. **Contributing code?** → [AGENTS.md](AGENTS.md)

---

## Project Structure

### Backend (`backend/`)

```
app/
├── Http/Controllers/        RESTful endpoint implementations
├── Models/                  Eloquent models (Employee, Leave, Payroll, etc.)
├── Services/                Business logic, policies
└── Middleware/              RBAC, CORS, auth

config/
├── cors.php                 CORS configuration for SPA
├── sanctum.php              Token auth setup
└── auth.php, session.php    Authentication configuration

database/
├── migrations/              Schema changes
└── seeders/                 Demo roles, permissions, users

routes/
└── api.php                  All REST endpoints under /api/v1/*

tests/
├── Feature/                 Integration tests (30 tests, all passing)
└── Unit/                    Unit tests
```

### Frontend (`build/`)

```
src/
├── main.tsx                 App bootstrap & providers
├── services/
│   └── api-client.ts        HTTP client (defaults to /api/v1)
├── modules/                 Feature modules (employees, payroll, etc.)
├── components/              Reusable UI components
├── store/                   Zustand state management
├── hooks/                   Custom React hooks
└── types/                   TypeScript interfaces

vite.config.ts              Build configuration (proxies /api/v1 in dev)
```

---

## API Documentation

### Base URL

**Development:** http://localhost:8000/api/v1
**Production:** https://your-domain.com/api/v1

### Authentication

```http
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "data": {
    "token": "bearer-token",
    "user": { "id": "...", "role_ids": [...] }
  }
}
```

Use token in header:
```http
Authorization: Bearer token-string
```

### Core Resources

| Resource | Endpoints | Example |
| --- | --- | --- |
| Employees | `GET/POST /api/v1/employees` | List employees, create new |
| Leave Requests | `GET/POST /api/v1/leaves` | Manage leave applications |
| Attendance | `GET/POST /api/v1/attendance` | Track attendance records |
| Payroll | `GET/POST /api/v1/payroll` | Process payroll |
| Job Openings | `GET/POST /api/v1/job-openings` | Post & manage openings |
| Candidates | `GET/POST /api/v1/candidates` | Track applications |
| Performance Reviews | `GET/POST /api/v1/performance-reviews` | Manage reviews |

All resources follow REST conventions:
- `GET /resource` – List all
- `POST /resource` – Create new
- `GET /resource/{id}` – Get one
- `PUT /resource/{id}` – Update
- `DELETE /resource/{id}` – Delete

---

## Testing

### Backend Tests

```powershell
cd backend
php artisan test
```

**Status:** ✅ 30/30 tests passing (132 assertions)

Tests cover:
- Auth flow (registration, login, token refresh)
- RBAC enforcement (role-based access control)
- CRUD operations (create, read, update, delete)
- CORS validation (preflight requests)
- API contracts (response formats)

### Frontend Tests (Optional)

```powershell
cd build
npm run test
```

---

## Environment Configuration

### Backend (.env)

```ini
APP_ENV=local
APP_DEBUG=true
DB_CONNECTION=sqlite

FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173
SANCTUM_STATEFUL_DOMAINS=localhost,127.0.0.1

DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=password
```

### Frontend (.env.local)

```ini
VITE_API_BASE_URL=/api/v1
VITE_BACKEND_URL=http://127.0.0.1:8000
```

See [DEVELOPMENT.md](DEVELOPMENT.md#environment-variables-reference) for all variables.

---

## Database

### Migrations

Create and manage database schema:

```powershell
php artisan migrate              # Run all migrations
php artisan migrate:fresh --seed # Reset and reseed
php artisan migrate:status       # Check status
```

### Seeding

Populate database with demo data:

```powershell
php artisan db:seed              # Run seeder
php artisan db:seed --class=RoleSeeder  # Run specific seeder
```

Seeders create:
- **40+ Permissions** – Fine-grained access control
- **10 System Roles** – Super Admin, HR Manager, Employee, etc.
- **Demo Admin User** – Credentials from `.env`

---

## Deployment

### Local Development
```powershell
# Backend
php artisan serve

# Frontend (separate terminal)
cd build && npm run dev
```

### Staging / Production

1. **Build backend:**
   ```powershell
   composer install --no-dev
   php artisan migrate --force
   php artisan db:seed --force
   ```

2. **Build frontend:**
   ```powershell
   cd build
   npm run build
   # Output: build/dist/
   ```

3. **Deploy to server:**
   - Upload backend code to server
   - Upload `build/dist/` to web server / CDN
   - Configure web server to proxy `/api/v1` to backend
   - Set environment variables in production `.env`

See [CI_BUILD.md](CI_BUILD.md) for automated deployment pipelines.

---

## Troubleshooting

### Backend Won't Start

```powershell
# Check PHP version
php --version  # Should be 8.2+

# Check composer
composer install

# Generate key
php artisan key:generate

# Create database
php artisan migrate
```

### Frontend Won't Start

```powershell
cd build
npm install
npm run dev
```

### CORS Errors

1. Ensure backend is running
2. Check `.env` `CORS_ALLOWED_ORIGINS` matches frontend URL
3. Clear browser cache (Ctrl+Shift+Delete)

### Tests Failing

```powershell
cd backend
php artisan migrate:fresh --env=testing
php artisan test
```

See [DEVELOPMENT.md#troubleshooting](DEVELOPMENT.md#troubleshooting) for more solutions.

---

## Contributing

Follow guidelines in [AGENTS.md](AGENTS.md):

1. **Code Style** – PSR-12 (backend), ESLint (frontend)
2. **Commits** – Clear, descriptive messages
3. **Tests** – Write tests for new features
4. **Documentation** – Update docs when changing architecture

---

## Security

- ✅ CORS restricted to frontend origin
- ✅ Sanctum token authentication
- ✅ CSRF protection via encrypted cookies
- ✅ Role-based access control (RBAC)
- ✅ Audit logging of all changes
- ✅ Password hashing with bcrypt

Deployment checklist in [DEVELOPMENT.md#security-checklist](DEVELOPMENT.md#security-checklist).

---

## Performance Optimization

### Frontend

- Code splitting with React.lazy()
- Image optimization with Vite
- CSS minification (Tailwind)
- Bundle analysis: `npm run build -- --analyze`

### Backend

- Database indexing on frequently queried columns
- Eager loading of relationships (prevent N+1 queries)
- Query caching where appropriate
- API response pagination

---

## Project Timeline

| Phase | Status | Description |
| --- | --- | --- |
| Phase 1: Backend Config | ✅ Complete | CORS, Sanctum setup |
| Phase 2: API Consolidation | ✅ Complete | Single /api/v1/* endpoint |
| Phase 3: Environment Standardization | ✅ Complete | Consistent env vars |
| Phase 4: Auth Contract | ✅ Complete | role_ids array standardization |
| Phase 5: Security Hardening | ✅ Complete | CORS, Sanctum, session config |
| Phase 6: Testing & Validation | ✅ Complete | All tests passing |
| Phase 7: Documentation | ✅ Complete | DEVELOPMENT.md, MIGRATION.md, CI_BUILD.md |
| Phase 8: Migration Planning | ✅ Complete | build/→frontend/ rename guide |

---

## Release Notes

### Version 1.0.0 (Current)

**Completed:**
- Full HRMS application with all modules
- REST API with role-based access control
- React/Vite frontend with TypeScript
- Comprehensive test suite (30 tests, all passing)
- Docker support
- CI/CD pipelines (GitHub Actions, GitLab CI)
- Complete documentation

**Known Limitations:**
- Frontend directory named `build/` (should rename to `frontend/` – see [MIGRATION.md](MIGRATION.md))
- OpenSSL duplicate warning in local PHP setup (see [DEVELOPMENT.md#php-openssl-warning](DEVELOPMENT.md#php-openssl-warning))

---

## Getting Help

1. **Setup issues?** → [DEVELOPMENT.md](DEVELOPMENT.md)
2. **Architecture questions?** → [MIGRATION.md](MIGRATION.md)
3. **API docs?** → [backend/README.md](backend/README.md)
4. **Contributing?** → [AGENTS.md](AGENTS.md)
5. **CI/CD questions?** → [CI_BUILD.md](CI_BUILD.md)

---

## License

Proprietary – All rights reserved.

---

## Contact

For questions or support, contact the development team.

---

## Roadmap

- [ ] Build→Frontend rename (deferred, see [MIGRATION.md](MIGRATION.md))
- [ ] Performance dashboard enhancements
- [ ] Mobile app (React Native)
- [ ] Advanced reporting & BI integration
- [ ] API rate limiting and throttling
- [ ] Webhook support for integrations
- [ ] GraphQL API (alternative to REST)

---

**Last Updated:** 2025
**Status:** Production Ready ✅
