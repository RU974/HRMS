# HRMS Backend API

**Laravel 12.x RESTful API for Human Resource Management System**

## Overview

The HRMS backend provides a complete REST API for managing employees, payroll, leave, recruitment, performance, and organizational structure. Built with Laravel 12, Sanctum authentication, and comprehensive RBAC.

**API Base URL:** `/api/v1/*`

**Documentation:** See [DEVELOPMENT.md](../DEVELOPMENT.md) and [MIGRATION.md](../MIGRATION.md)

---

## Quick Start

### Prerequisites

- PHP 8.2+
- Composer
- MySQL/MariaDB or SQLite

### Setup

```powershell
# 1. Install dependencies
composer install

# 2. Setup environment
Copy-Item .env.example .env
php artisan key:generate

# 3. Create database
php artisan migrate

# 4. Seed demo data
php artisan db:seed

# 5. Start server
php artisan serve
```

API runs on: **http://localhost:8000**

---

## Architecture

### Technology Stack

- **Framework:** Laravel 12.x
- **Authentication:** Laravel Sanctum
- **Database:** SQLite (dev) / MySQL (prod)
- **Testing:** PHPUnit 11.5.55
- **API Version:** v1 (stable, single endpoint)

### Directory Structure

```
app/
├── Http/
│   ├── Controllers/        # RESTful endpoints
│   └── Middleware/         # CORS, RBAC, auth
├── Models/                 # Eloquent models
├── Services/               # Business logic
└── Resources/              # API response formatters

config/
├── cors.php               # CORS for SPA
├── sanctum.php            # Token auth config
└── auth.php               # Auth guards

database/
├── migrations/            # Schema changes
└── seeders/               # Demo data

routes/
└── api.php                # All routes under /api/v1/*

tests/
├── Feature/               # Integration tests
└── Unit/                  # Unit tests
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login and get token |
| POST | `/api/v1/auth/logout` | Invalidate token |
| GET | `/api/v1/auth/me` | Get current user |
| POST | `/api/v1/auth/refresh` | Refresh token |

### Resources (CRUD)

All use standard RESTful conventions:

| Resource | Endpoints |
| --- | --- |
| Employees | `GET/POST /api/v1/employees` |
| Leave Requests | `GET/POST /api/v1/leaves` |
| Attendance | `GET/POST /api/v1/attendance` |
| Payroll | `GET/POST /api/v1/payroll` |
| Job Openings | `GET/POST /api/v1/job-openings` |
| Candidates | `GET/POST /api/v1/candidates` |
| Performance Reviews | `GET/POST /api/v1/performance-reviews` |

See `routes/api.php` for complete list.

---

## Authentication

### Token-Based (Bearer)

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
    "token": "bearer-token-string",
    "user": { "id": "...", "email": "...", "role_ids": [...] }
  }
}
```

Use token in subsequent requests:

```http
GET /api/v1/employees
Authorization: Bearer bearer-token-string
```

### Role-Based Access Control (RBAC)

Permissions enforced via middleware on protected routes:

```php
Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('employees', EmployeeController::class);
    // Only authenticated users can access
});
```

User roles and permissions are seeded from `DatabaseSeeder`.

---

## Configuration

### Environment Variables

Key `.env` variables:

```ini
# App
APP_ENV=local
APP_DEBUG=true

# Database
DB_CONNECTION=sqlite
DB_DATABASE=database.sqlite

# CORS/SPA
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Sanctum
SANCTUM_STATEFUL_DOMAINS=localhost,127.0.0.1
```

See `config/cors.php` and `config/sanctum.php` for defaults.

---

## Testing

### Run All Tests

```powershell
php artisan test
```

**Expected output:** `OK (30 tests, 132 assertions)`

### Test Categories

1. **Auth Flow** – Registration, login, token refresh
2. **RBAC** – Role-based access control
3. **CRUD** – Create, read, update, delete operations
4. **CORS** – Cross-origin requests
5. **API Contracts** – Response formats and status codes

### Debug Tests

```powershell
# Verbose output
php artisan test --verbose

# Specific test
php artisan test --filter=AuthSanctumFlowTest

# Watch mode
php artisan test --watch
```

---

## Development Workflow

### Create New Feature

1. **Create migration:**
   ```powershell
   php artisan make:migration create_features_table
   ```

2. **Create model:**
   ```powershell
   php artisan make:model Feature -m
   ```

3. **Create controller:**
   ```powershell
   php artisan make:controller FeatureController --model=Feature
   ```

4. **Register routes** in `routes/api.php`:
   ```php
   Route::apiResource('features', FeatureController::class);
   ```

5. **Write tests** in `tests/Feature/`:
   ```powershell
   php artisan make:test FeatureCrudTest
   ```

6. **Run tests:**
   ```powershell
   php artisan test
   ```

---

## Security

- CORS restricted to frontend origin only
- Sanctum tokens expire after inactivity
- CSRF protection via encrypted cookies
- Role-based authorization on all protected endpoints
- Password hashing with bcrypt

---

## Deployment

### Staging/Production

1. **Setup environment:**
   ```powershell
   cp .env.example .env.production
   # Edit .env with production values
   php artisan key:generate
   ```

2. **Install dependencies:**
   ```powershell
   composer install --no-dev --optimize-autoloader
   ```

3. **Run migrations:**
   ```powershell
   php artisan migrate --force
   ```

4. **Seed roles/permissions:**
   ```powershell
   php artisan db:seed --force
   ```

5. **Cache configuration:**
   ```powershell
   php artisan config:cache
   php artisan route:cache
   ```

6. **Start application** on production web server (Apache/Nginx with PHP-FPM)

---

## Troubleshooting

### Tests Fail: "Table Not Found"

```powershell
php artisan migrate:fresh --env=testing
php artisan test
```

### CORS Errors

1. Check `CORS_ALLOWED_ORIGINS` in `.env`
2. Ensure frontend URL matches exactly
3. Verify request includes `Origin` header

### Port Conflict

```powershell
php artisan serve --port=8001
```

---

## Resources

- [Laravel Documentation](https://laravel.com/docs)
- [Sanctum Authentication](https://laravel.com/docs/sanctum)
- [Eloquent ORM](https://laravel.com/docs/eloquent)
- [API Resources](https://laravel.com/docs/eloquent-resources)

See also:
- [DEVELOPMENT.md](../DEVELOPMENT.md) – Full dev setup
- [MIGRATION.md](../MIGRATION.md) – Architecture decisions
- [CI_BUILD.md](../CI_BUILD.md) – CI/CD configuration

---

## Contributing

Follow guidelines in [AGENTS.md](../AGENTS.md).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
