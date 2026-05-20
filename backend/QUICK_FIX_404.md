# Quick Fix: POST http://localhost:8000/api/auth/register 404 Error

## ✅ The Issue is FIXED!

The main issue was that `api.php` routes weren't being loaded. This has been corrected in `bootstrap/app.php`.

## 🚀 Quick Steps to Complete Setup

### Step 1: Navigate to Backend
```bash
cd backend
```

### Step 2: Install Sanctum (Required for API tokens)
```bash
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
```

### Step 3: Run Migrations
```bash
php artisan migrate
```

### Step 4: Clear All Caches
```bash
php artisan cache:clear
php artisan config:clear
php artisan route:clear
```

### Step 5: Verify Routes are Registered
```bash
php artisan route:list | grep auth
```

You should see:
```
POST    api/auth/register
POST    api/auth/login
POST    api/auth/logout
GET     api/auth/me
```

### Step 6: Start Laravel Server
```bash
php artisan serve
```

The server should start at: `http://localhost:8000`

### Step 7: In Another Terminal, Start Frontend
```bash
cd build
npm run dev
```

Frontend will run at: `http://localhost:5173`

---

## ✅ Verify Setup with PowerShell Script (Windows)

Run the automated setup verification:

```bash
cd d:\HRMS
powershell -ExecutionPolicy Bypass -File .\backend\setup-verify.ps1
```

This will:
- ✓ Check Laravel installation
- ✓ Create .env file if missing
- ✓ Clear all caches
- ✓ Install Sanctum
- ✓ Run migrations
- ✓ Verify all routes are registered

---

## 🔍 If You Still Get 404 Error

### Check 1: Verify API Routes are Loading
```bash
php artisan route:list
```

Look for routes starting with `/api/auth/`

### Check 2: Check bootstrap/app.php
Make sure it looks like this:
```php
->withRouting(
    web: __DIR__.'/../routes/web.php',
    api: __DIR__.'/../routes/api.php',
    commands: __DIR__.'/../routes/console.php',
    health: '/up',
)
```

### Check 3: Verify AuthController Exists
```bash
php artisan make:controller AuthController
```

The file should be at: `app/Http/Controllers/AuthController.php`

### Check 4: Check .env Configuration
```
APP_URL=http://localhost:8000
DB_CONNECTION=sqlite
```

### Check 5: CORS Configuration (config/cors.php)
```php
'allowed_origins' => [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
],
'supports_credentials' => true,
```

---

## 📝 What Was Changed

1. **bootstrap/app.php** - Added `api: __DIR__.'/../routes/api.php'` to load API routes
2. **AuthController.php** - Updated register() to return JWT token
3. **routes/api.php** - Already properly configured

---

## ✅ Test the API

Once everything is running, test with curl:

```bash
# Test Registration
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test User\",
    \"email\": \"test@example.com\",
    \"password\": \"password123\",
    \"password_confirmation\": \"password123\"
  }"

# Test Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"test@example.com\",
    \"password\": \"password123\"
  }"
```

---

## 🎉 You're All Set!

Now try registering or logging in from your HRMS app at:
- **Login**: http://localhost:5173/auth/login
- **Register**: http://localhost:5173/auth/register

The 404 error should be completely gone! 🚀
