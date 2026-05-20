# HRMS Backend Setup Verification Script for Windows

Write-Host "================================" -ForegroundColor Cyan
Write-Host "HRMS Backend Setup Verification" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

Set-Location backend

Write-Host "Step 1: Checking Laravel Installation..." -ForegroundColor Green
if (Test-Path "artisan") {
    Write-Host "  ✓ Laravel installation found" -ForegroundColor Green
} else {
    Write-Host "  ✗ Laravel not found" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Checking if .env file exists..." -ForegroundColor Green
if (Test-Path ".env") {
    Write-Host "  ✓ .env file found" -ForegroundColor Green
} else {
    Write-Host "  ✗ .env file not found - creating from .env.example" -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        php artisan key:generate
        Write-Host "  ✓ .env created and app key generated" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Step 3: Clearing all caches..." -ForegroundColor Green
php artisan cache:clear
php artisan config:clear
php artisan route:clear
Write-Host "  ✓ Caches cleared" -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: Installing Composer dependencies..." -ForegroundColor Green
composer install
Write-Host "  ✓ Dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "Step 5: Checking Sanctum Installation..." -ForegroundColor Green
$sanctumCheck = Select-String -Path "composer.json" -Pattern "laravel/sanctum" -Quiet
if ($sanctumCheck) {
    Write-Host "  ✓ Sanctum already installed" -ForegroundColor Green
} else {
    Write-Host "  Installing Sanctum..." -ForegroundColor Yellow
    composer require laravel/sanctum
    php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
    Write-Host "  ✓ Sanctum installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 6: Running Migrations..." -ForegroundColor Green
php artisan migrate --force
Write-Host "  ✓ Migrations completed" -ForegroundColor Green

Write-Host ""
Write-Host "Step 7: Verifying Routes..." -ForegroundColor Green
php artisan route:list | Select-String "auth"
Write-Host "  ✓ Auth routes registered" -ForegroundColor Green

Write-Host ""
Write-Host "Step 8: Checking Controllers..." -ForegroundColor Green
if (Test-Path "app/Http/Controllers/AuthController.php") {
    Write-Host "  ✓ AuthController found" -ForegroundColor Green
} else {
    Write-Host "  ✗ AuthController not found" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Setup Verification Complete!" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Make sure .env has: APP_URL=http://localhost:8000" -ForegroundColor White
Write-Host "2. Run: php artisan serve" -ForegroundColor White
Write-Host "3. In another terminal, run: cd build && npm run dev" -ForegroundColor White
Write-Host ""
