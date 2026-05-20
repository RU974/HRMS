# Fix: api/auth/register Route Error

## Issue
Getting error: "The route api/auth/register could not be found"

## Solutions

### ✅ Solution 1: Clear Laravel Route Cache (FIRST TRY THIS)

Run these commands in your Laravel project:

```bash
cd backend

# Clear all caches
php artisan cache:clear
php artisan config:clear
php artisan route:clear

# Rebuild caches
php artisan config:cache
php artisan route:cache
```

---

### ✅ Solution 2: Install & Configure Sanctum (If not already done)

Sanctum is required for API token authentication:

```bash
cd backend

# Install Sanctum
composer require laravel/sanctum

# Publish Sanctum configuration
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"

# Run migrations
php artisan migrate
```

### Sanctum Configuration (`config/sanctum.php`)
Make sure this is set:
```php
'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', 'localhost,localhost:3000,localhost:5173,127.0.0.1')),
```

---

### ✅ Solution 3: Fix CORS Configuration

Edit `config/cors.php`:

```php
<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

---

### ✅ Solution 4: Verify API Route File

Make sure `routes/api.php` looks like this:

```php
<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

// Public authentication routes
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('auth')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});
```

---

### ✅ Solution 5: Verify Your Frontend Environment

Make sure `build/.env.local` has correct API URL:

```
VITE_API_URL=http://localhost:8000/api
VITE_APP_URL=http://localhost:5173
```

---

### ✅ Solution 6: Update AppServiceProvider

Edit `app/Providers/AppServiceProvider.php`:

```php
<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Route;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::middleware('api')
            ->prefix('api')
            ->group(base_path('routes/api.php'));
    }
}
```

---

## ✅ Complete Restart Procedure

If nothing works, try a complete restart:

```bash
cd backend

# Stop the server (Ctrl+C)

# Clear everything
php artisan cache:clear
php artisan config:clear
php artisan route:clear

# Remove vendor and reinstall
composer install

# Run migrations
php artisan migrate

# Start fresh
php artisan serve
```

Then in another terminal:

```bash
cd build
npm run dev
```

---

## ✅ Test the Routes

Once fixed, test routes using curl:

```bash
# Test public register route
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "password_confirmation": "password123"
  }'

# Test public login route
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

## ✅ Debug: Check if Routes are Registered

Run this command to see all registered routes:

```bash
php artisan route:list | grep auth
```

You should see:
- `POST api/auth/register`
- `POST api/auth/login`
- `POST api/auth/logout` (protected)
- `GET api/auth/me` (protected)

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| 404 on register route | Clear route cache: `php artisan route:clear` |
| CORS error | Update `config/cors.php` with frontend URL |
| AuthController not found | Check namespace in controller file |
| Sanctum errors | Run `php artisan migrate` |
| Token not working | Make sure `auth:sanctum` middleware is applied |

---

Try these solutions in order. Most issues are solved by clearing the route cache!
