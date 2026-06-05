# Database Seeding Guide

This guide explains how to seed initial RBAC roles, permissions, and approval workflows in the HRMS application.

## Overview

The database seeding setup includes:
- **10 predefined roles** with hierarchical permissions
- **Comprehensive permission matrix** covering all modules
- **5 approval workflows** for different business processes
- **Automatic permission assignment** to roles

## Seeders Included

### 1. PermissionSeeder
Creates all permissions across the system:
- Module-based permissions (dashboard, users, employees, leaves, etc.)
- Actions: view, create, edit, delete, approve, export, import, assign, manage_settings
- Approval-specific permissions: approvals:view, approvals:approve, approvals:manage_settings

**File:** `backend/database/seeders/PermissionSeeder.php`

### 2. RoleSeeder
Creates 10 core roles:
- Super Admin
- Company Admin
- HR Manager
- HR Executive
- Payroll Manager
- Attendance Manager
- Recruiter
- Department Manager
- IT Support
- Employee

**File:** `backend/database/seeders/RoleSeeder.php`

### 3. RolePermissionSeeder
Assigns specific permissions to each role based on responsibilities:
- Super Admin: All permissions (wildcard: `*.*`)
- Company Admin: 19 permissions covering full system access
- HR Manager: 16 permissions for HR operations
- HR Executive: 10 permissions for limited HR operations
- Payroll Manager: 6 permissions for payroll operations
- Attendance Manager: 4 permissions for attendance management
- Recruiter: 3 permissions for recruitment
- Department Manager: 6 permissions for team management
- IT Support: 4 permissions for system support
- Employee: 5 permissions for self-service

**File:** `backend/database/seeders/RolePermissionSeeder.php`

### 4. WorkflowSeeder
Creates 5 approval workflows:

#### Leave Request
- Module: leaves
- Steps:
  1. Department Manager (initial review)
  2. HR Manager (final approval for requests >= 3 days)

#### Payroll Approval
- Module: payroll
- Steps:
  1. Payroll Manager (verification)
  2. HR Manager (final approval)

#### Candidate Interview
- Module: recruitment
- Steps:
  1. Recruiter (initial screening)
  2. Department Manager (team lead review)
  3. HR Manager (final decision)

#### Attendance Exception
- Module: attendance
- Steps:
  1. Attendance Manager (review)
  2. HR Manager (approval)

#### Performance Appraisal
- Module: performance
- Steps:
  1. Department Manager (initial review)
  2. HR Manager (final approval)

**File:** `backend/database/seeders/WorkflowSeeder.php`

## Running the Seeders

### Option 1: Run All Seeders at Once
```bash
cd backend
php artisan db:seed
```

This runs the `DatabaseSeeder` which calls all seeders in order:
1. PermissionSeeder
2. RoleSeeder
3. RolePermissionSeeder
4. WorkflowSeeder

### Option 2: Run Individual Seeders
```bash
cd backend

# Seed permissions only
php artisan db:seed --class=PermissionSeeder

# Seed roles
php artisan db:seed --class=RoleSeeder

# Assign permissions to roles
php artisan db:seed --class=RolePermissionSeeder

# Create workflows
php artisan db:seed --class=WorkflowSeeder
```

### Option 3: Fresh Database with Seeds
```bash
cd backend
php artisan migrate:fresh --seed
```

This will:
- Drop all existing tables
- Run all migrations
- Run all seeders

⚠️ **Warning:** This removes all data. Use only in development.

## Default Admin User

The seeder creates a default admin user with the Super Admin role:
- **Email:** `admin@example.com` (configurable via `DEFAULT_ADMIN_EMAIL`)
- **Password:** `password` (configurable via `DEFAULT_ADMIN_PASSWORD`)
- **Name:** `Super Admin` (configurable via `DEFAULT_ADMIN_NAME`)

To customize these values, set environment variables before running the seeder:
```bash
export DEFAULT_ADMIN_EMAIL=yourmail@example.com
export DEFAULT_ADMIN_PASSWORD=yourpassword
export DEFAULT_ADMIN_NAME="Your Name"

php artisan db:seed
```

Or edit `.env` file:
```env
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=SecurePassword123!
DEFAULT_ADMIN_NAME=Super Admin
```

## Role-Permission Matrix

### Super Admin
- All permissions (`*.*`)

### Company Admin
- Dashboard: view
- Users: view, create, edit, delete, assign
- Employees: view, create, edit, delete
- Leaves: view, approve, manage_settings
- Attendance: view, edit, manage_settings
- Payroll: view, edit, manage_settings
- Recruitment: view, create, edit, delete
- Approvals: view, approve, manage_settings
- Settings: manage_settings
- Reports: view, manage_settings
- Performance: view, edit, manage_settings

### HR Manager
- Dashboard: view
- Employees: view, create, edit
- Leaves: view, approve, manage_settings
- Attendance: view, edit
- Recruitment: view, create, edit
- Documents: view, create, edit, delete
- Approvals: view, approve, manage_settings
- Reports: view
- Announcements: view, create, edit
- Performance: view, edit

### Payroll Manager
- Dashboard: view
- Employees: view
- Payroll: view, create, edit, approve, manage_settings
- Attendance: view
- Approvals: view, approve
- Reports: view, export
- Performance: view

### Department Manager
- Dashboard: view
- Employees: view
- Leaves: view, approve
- Attendance: view
- Approvals: view, approve
- Performance: view, edit

### Employee (Self-Service)
- Dashboard: view
- Leaves: view, create, approve (for own requests)
- Attendance: view
- Reports: view
- Documents: view
- Announcements: view
- Notifications: view

## Verification

After seeding, verify the data:

```bash
cd backend

# Check roles
php artisan tinker
>>> App\Models\Role::count()
// Should return 10

# Check permissions
>>> App\Models\Permission::count()
// Should return many (module:action combinations)

# Check workflows
>>> App\Models\Workflow::count()
// Should return 5

# Check admin user
>>> App\Models\User::where('email', 'admin@example.com')->first()
// Should return the admin user with Super Admin role
```

## Environment Setup

Ensure your `.env` file has:
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=hrms
DB_USERNAME=root
DB_PASSWORD=

DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=password
DEFAULT_ADMIN_NAME=Super Admin
```

## Troubleshooting

### Seeder Fails on Foreign Key Constraint
Ensure migrations have been run:
```bash
php artisan migrate
```

### Permissions Not Assigned to Roles
Check that `RolePermissionSeeder` runs after `RoleSeeder`:
```bash
# Manually run in order
php artisan db:seed --class=PermissionSeeder
php artisan db:seed --class=RoleSeeder
php artisan db:seed --class=RolePermissionSeeder
```

### Workflows Not Created
Verify workflow dependencies:
```bash
# Ensure roles exist first
php artisan db:seed --class=RoleSeeder

# Then seed workflows
php artisan db:seed --class=WorkflowSeeder
```

## Next Steps

After seeding:
1. Log in with default admin credentials
2. Create company-specific roles if needed
3. Create additional workflows for custom processes
4. Assign users to roles
5. Test permission guards on protected endpoints

## References

- [Laravel Seeding Documentation](https://laravel.com/docs/seeders)
- [HRMS RBAC Architecture](../RBAC_HARDENING_PR.md)
- [Approval Workflow System](../docs/workflow-system.md)
