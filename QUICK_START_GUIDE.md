# HRMS Quick Start Guide

Get the HRMS application running in 5 minutes.

## Prerequisites

- PHP 8.2+
- Node.js 18+
- MySQL 8.0+
- Composer 2+

## Quick Setup

### 1. Backend (5 minutes)

```bash
cd backend

# Install dependencies
composer install

# Setup environment
cp .env.example .env
php artisan key:generate

# Database
# Create MySQL database: CREATE DATABASE hrms;

# Run migrations and seed
php artisan migrate
php artisan db:seed

# Start server
php artisan serve
# Backend running at: http://localhost:8000
```

### 2. Frontend (3 minutes)

```bash
cd build

# Install dependencies
npm install

# Setup environment
echo 'VITE_API_BASE_URL=http://localhost:8000/api/v1' > .env

# Start development server
npm run dev
# Frontend running at: http://localhost:5173
```

## Login

- **Email**: `admin@example.com`
- **Password**: `password`

## Verify Installation

```bash
# Backend API test
curl -X GET http://localhost:8000/api/v1/approvals \
  -H "Authorization: Bearer YOUR_TOKEN"

# Frontend should load without errors
# Open http://localhost:5173 in browser
```

## Common Commands

```bash
# Database
php artisan migrate              # Run migrations
php artisan db:seed             # Seed data
php artisan migrate:fresh --seed # Reset database
php artisan tinker              # Interactive shell

# Testing
php artisan test                # Run tests

# Frontend
npm run build                   # Production build
npm run lint                    # Code quality
npx tsc --noEmit               # Type checking

# Cache
php artisan cache:clear        # Clear cache
php artisan route:clear        # Clear routes
```

## Project Structure

```
backend/
├── app/
│   ├── Http/Controllers/      # API endpoints
│   ├── Models/                # Database models
│   └── Services/              # Business logic
├── database/
│   ├── migrations/            # Schema changes
│   └── seeders/               # Initial data
└── routes/api.php             # API routes

build/
├── src/
│   ├── modules/               # Feature pages
│   ├── services/              # API calls
│   └── components/            # Reusable UI
├── index.html                 # HTML entry
└── vite.config.ts             # Build config
```

## Key Features

✅ **RBAC** - 10 predefined roles with permission matrix  
✅ **Approvals** - Multi-step approval workflows  
✅ **Audit Log** - Immutable activity tracking  
✅ **Notifications** - Real-time approval updates  
✅ **Dashboard** - Role-based interface  

## Next Steps

1. Customize company settings in admin panel
2. Create users and assign roles
3. Configure approval workflows for your modules
4. Test workflows end-to-end
5. Deploy to production

## Troubleshooting

**Database connection error?**
```bash
# Check MySQL is running and credentials are correct in .env
mysql -u root -p -e "SELECT 1;"
```

**Port already in use?**
```bash
# Use different port
php artisan serve --port=8001
npm run dev -- --port 5174
```

**Node modules issues?**
```bash
cd build
rm -rf node_modules package-lock.json
npm install
```

## Documentation

- [Complete Setup Guide](./SETUP_AND_MIGRATION_GUIDE.md)
- [Database Seeding Guide](./backend/DATABASE_SEEDING_GUIDE.md)
- [RBAC Architecture](./backend/RBAC_HARDENING_PR.md)
- [Repository Guidelines](./AGENTS.md)

---

**Ready to code?** Start with the [Complete Setup Guide](./SETUP_AND_MIGRATION_GUIDE.md) if you hit any issues.
