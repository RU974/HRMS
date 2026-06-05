# HRMS Complete Setup & Migration Guide

## Overview

This guide provides step-by-step instructions to set up and run the HRMS (Human Resource Management System) application from scratch, including database setup, seeding, and verification.

## Prerequisites

- **PHP**: 8.2 or higher
- **Node.js**: 18.x or higher
- **npm**: 10.x or higher
- **MySQL**: 8.0 or higher
- **Git**: Latest version
- **Composer**: 2.x or higher

## Project Structure

```
D:\HRMS/
├── backend/          # Laravel API backend
├── build/            # React Vite frontend
├── AGENTS.md         # Repository guidance
└── README.md         # Project overview
```

## Installation Steps

### 1. Clone Repository

```bash
git clone <repository-url> d:\HRMS
cd d:\HRMS
```

### 2. Backend Setup

#### 2.1 Install Dependencies

```bash
cd backend
composer install
```

#### 2.2 Environment Configuration

Create `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
APP_NAME=HRMS
APP_ENV=local
APP_DEBUG=true
APP_KEY=                          # Will be generated in step 2.3
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=hrms
DB_USERNAME=root
DB_PASSWORD=

# Default admin credentials
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=password
DEFAULT_ADMIN_NAME=Super Admin

# Approval escalation settings
APPROVAL_ESCALATION_THRESHOLD_HOURS=48

# Sanctum token expiry (in days)
SANCTUM_EXPIRATION=30

# Mail settings (optional for notifications)
MAIL_MAILER=log
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
```

#### 2.3 Generate Application Key

```bash
php artisan key:generate
```

#### 2.4 Database Setup

Create MySQL database:

```sql
CREATE DATABASE hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Or via MySQL command line:

```bash
mysql -u root -p -e "CREATE DATABASE hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

#### 2.5 Run Migrations

```bash
cd backend
php artisan migrate
```

Expected output:
```
Migration table created successfully.
...
✓ Creating migrations table
✓ Creating users table
✓ Creating roles table
✓ Creating permissions table
✓ Creating workflows table
✓ ... (all migrations)
✓ Database migrations completed
```

Verify migrations:

```bash
php artisan migrate:status
```

#### 2.6 Seed Database

Run all seeders to populate roles, permissions, and example workflows:

```bash
php artisan db:seed
```

Or seed individual seeders:

```bash
# Seed permissions
php artisan db:seed --class=PermissionSeeder

# Seed roles
php artisan db:seed --class=RoleSeeder

# Assign permissions to roles
php artisan db:seed --class=RolePermissionSeeder

# Create example workflows
php artisan db:seed --class=WorkflowSeeder
```

### 3. Frontend Setup

#### 3.1 Install Dependencies

```bash
cd build
npm install
```

#### 3.2 Environment Configuration

Create `.env` file:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_APP_NAME=HRMS
```

#### 3.3 Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

Expected output: No errors

## Running the Application

### Backend Server

```bash
cd backend

# Start development server
php artisan serve --host=127.0.0.1 --port=8000

# Server runs at: http://localhost:8000
```

### Frontend Development Server

```bash
cd build

# Start development server with hot reload
npm run dev

# Server runs at: http://localhost:5173
```

### Building for Production

#### Backend

```bash
cd backend

# No build needed, configure web server (nginx/apache)
# Point document root to backend/public/
```

#### Frontend

```bash
cd build

# Build optimized production bundle
npm run build

# Output in: build/dist/

# Preview production build locally
npm run preview
```

## Verification Checklist

### Database

```bash
cd backend

# Check tables
php artisan migrate:status

# Verify data via tinker
php artisan tinker

>>> App\Models\Role::count()
// Expected: 10

>>> App\Models\Permission::count()
// Expected: Many (module:action combinations)

>>> App\Models\Workflow::count()
// Expected: 5

>>> App\Models\User::where('email', 'admin@example.com')->first()
// Expected: Admin user exists

>>> exit()
```

### Backend API

```bash
# Test authentication
curl -X POST http://localhost:8000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password"
  }'

# Response should contain access token

# Test approvals endpoint (requires token)
curl -X GET http://localhost:8000/api/v1/approvals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Frontend

```bash
# Navigate to http://localhost:5173
# Login with admin credentials:
# Email: admin@example.com
# Password: password

# Verify:
# - Dashboard loads without errors
# - Sidebar displays with role-based menu items
# - Can navigate to approvals page
# - Can view approval workflows
```

## Login Credentials

### Default Admin Account

- **Email**: `admin@example.com`
- **Password**: `password`
- **Role**: Super Admin

### Test Accounts (Optional - Create via Admin Panel)

Create additional test users with different roles:

```bash
# Via tinker
php artisan tinker

>>> $user = App\Models\User::create([
    'name' => 'HR Manager',
    'email' => 'hr@example.com',
    'password' => bcrypt('password'),
    'company_id' => 1,
    'role_id' => 2,
]);

>>> $user->createToken('hr-token');
>>> exit()
```

## API Endpoints Overview

### Authentication

```
POST   /api/v1/login              # Login
POST   /api/v1/logout             # Logout
GET    /api/v1/me                 # Get current user
```

### Approvals

```
GET    /api/v1/approvals          # List approvals
GET    /api/v1/approvals/{id}     # Get approval details
POST   /api/v1/approvals          # Create approval
POST   /api/v1/approvals/{id}/approve # Approve
POST   /api/v1/approvals/{id}/reject  # Reject
```

### Workflows

```
GET    /api/v1/workflows          # List workflows
POST   /api/v1/workflows          # Create workflow
DELETE /api/v1/workflows/{id}     # Delete workflow
```

### Audit Logs

```
GET    /api/v1/audit-logs         # List audit logs
GET    /api/v1/audit-logs/{id}    # Get audit log
```

## Common Issues & Solutions

### Database Connection Error

**Error**: `SQLSTATE[HY000] [2002] Connection refused`

**Solution**:
1. Verify MySQL is running
2. Check DB_HOST, DB_PORT in .env
3. Verify DB_USERNAME and DB_PASSWORD

### Migration Fails

**Error**: `SQLSTATE[42000]: Syntax error`

**Solution**:
```bash
# Rollback migrations
php artisan migrate:rollback

# Check migration files for syntax errors
# Run again
php artisan migrate
```

### Node Modules Issue

**Error**: `Cannot find module '@/...'`

**Solution**:
```bash
cd build
rm -r node_modules
npm install
npm run build
```

### Permission Denied on artisan

**Solution**:
```bash
# Make artisan executable
chmod +x backend/artisan

# Or run via php
php backend/artisan migrate
```

### Seeding Takes Too Long

**Solution**:
```bash
# Seed one seeder at a time
php artisan db:seed --class=PermissionSeeder
php artisan db:seed --class=RoleSeeder
php artisan db:seed --class=RolePermissionSeeder
php artisan db:seed --class=WorkflowSeeder
```

## Development Workflow

### Making Changes

#### Backend

1. Create/modify Laravel controllers, models, services
2. Run migrations if database schema changes: `php artisan migrate`
3. Test changes: `php artisan test`
4. Server auto-reloads on file changes

#### Frontend

1. Create/modify React components, pages, services
2. TypeScript validates automatically: `npx tsc --noEmit`
3. Hot reload applies changes instantly
4. Run linter: `npm run lint`

### Database Seeding During Development

```bash
# Start fresh with all data
php artisan migrate:fresh --seed

# Seed only without migrations
php artisan db:seed

# Reseed specific tables
php artisan migrate:refresh --seed
```

## Testing

### Run All Tests

```bash
cd backend
php artisan test
```

### Run Specific Test

```bash
php artisan test tests/Feature/RBACTest.php
php artisan test tests/Feature/WorkflowTest.php
php artisan test tests/Feature/AuditLoggingTest.php
```

### Run with Coverage

```bash
php artisan test --coverage
```

## Deployment Checklist

- [ ] Set `APP_DEBUG=false` in production `.env`
- [ ] Generate new `APP_KEY`
- [ ] Configure database with production credentials
- [ ] Configure mail service for notifications
- [ ] Set up CORS domain whitelist
- [ ] Configure file storage (S3 or local)
- [ ] Run migrations: `php artisan migrate --force`
- [ ] Seed initial data: `php artisan db:seed`
- [ ] Build frontend: `npm run build`
- [ ] Deploy frontend to CDN/hosting
- [ ] Configure web server (nginx/apache)
- [ ] Set up HTTPS/SSL certificates
- [ ] Configure domain and DNS
- [ ] Test login and core workflows
- [ ] Set up monitoring and logging
- [ ] Create backup strategy

## Monitoring & Logs

### Backend Logs

```bash
# Check Laravel logs
tail -f backend/storage/logs/laravel.log

# View recent errors
php artisan log:clear
php artisan log:tail
```

### Frontend Logs

Browser console logs are visible in Developer Tools (F12)

## Performance Optimization

### Backend

```bash
# Clear application cache
php artisan cache:clear

# Clear route cache (development only)
php artisan route:clear

# Optimize for production
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### Frontend

```bash
# Analyze bundle size
npm run build -- --report

# Build with minification
npm run build
```

## Security Notes

- Change default admin password immediately in production
- Use strong passwords and enable two-factor authentication
- Rotate API tokens regularly
- Restrict API access by IP address if possible
- Enable HTTPS in production
- Keep dependencies updated: `composer update`, `npm update`
- Run security audit: `npm audit`

## Next Steps

1. ✅ Complete the setup using this guide
2. ✅ Log in with admin credentials
3. ✅ Create additional users and roles
4. ✅ Set up company-specific workflows
5. ✅ Configure notifications (optional)
6. ✅ Customize dashboard and branding
7. ✅ Train users and roll out to organization
8. ✅ Monitor usage and performance

## Support & Resources

- [Laravel Documentation](https://laravel.com/docs)
- [React Documentation](https://react.dev)
- [AGENTS.md](../AGENTS.md) - Repository conventions
- [DATABASE_SEEDING_GUIDE.md](./DATABASE_SEEDING_GUIDE.md) - Seeding details

## Quick Reference Commands

```bash
# Backend
cd backend
composer install                    # Install dependencies
php artisan key:generate           # Generate app key
php artisan migrate                # Run migrations
php artisan db:seed                # Seed database
php artisan serve                  # Start server
php artisan test                   # Run tests

# Frontend
cd build
npm install                        # Install dependencies
npm run dev                        # Start dev server
npm run build                      # Build for production
npm run lint                       # Run linter
npx tsc --noEmit                  # Type check
```

---

**Last Updated**: June 2026
**Version**: 1.0
**Status**: Production Ready
