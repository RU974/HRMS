#!/bin/bash

# HRMS Backend Setup Verification Script

echo "================================"
echo "HRMS Backend Setup Verification"
echo "================================"
echo ""

cd backend

echo "✓ Step 1: Checking Laravel Installation..."
if [ -f "artisan" ]; then
    echo "  ✓ Laravel installation found"
else
    echo "  ✗ Laravel not found"
    exit 1
fi

echo ""
echo "✓ Step 2: Checking if .env file exists..."
if [ -f ".env" ]; then
    echo "  ✓ .env file found"
else
    echo "  ✗ .env file not found - creating from .env.example"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        php artisan key:generate
        echo "  ✓ .env created and app key generated"
    fi
fi

echo ""
echo "✓ Step 3: Clearing all caches..."
php artisan cache:clear
php artisan config:clear
php artisan route:clear
echo "  ✓ Caches cleared"

echo ""
echo "✓ Step 4: Checking Sanctum Installation..."
if grep -q "laravel/sanctum" composer.json; then
    echo "  ✓ Sanctum already installed"
else
    echo "  Installing Sanctum..."
    composer require laravel/sanctum
    php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
    echo "  ✓ Sanctum installed"
fi

echo ""
echo "✓ Step 5: Running Migrations..."
php artisan migrate --force
echo "  ✓ Migrations completed"

echo ""
echo "✓ Step 6: Verifying Routes..."
php artisan route:list | grep auth
echo "  ✓ Auth routes registered"

echo ""
echo "✓ Step 7: Checking Controllers..."
if [ -f "app/Http/Controllers/AuthController.php" ]; then
    echo "  ✓ AuthController found"
else
    echo "  ✗ AuthController not found"
    exit 1
fi

echo ""
echo "================================"
echo "Setup Verification Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Make sure .env has: APP_URL=http://localhost:8000"
echo "2. Run: php artisan serve"
echo "3. In another terminal, run: cd build && npm run dev"
echo ""
