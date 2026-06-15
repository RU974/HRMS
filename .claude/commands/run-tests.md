Run the PHP test suite. Pass an optional filter to target a specific test.

```powershell
cd backend
php artisan test $ARGUMENTS
```

Examples:
- All tests: (no arguments)
- Single file: `tests/Feature/RBACTest.php`
- Named test: `--filter SuperAdminAccessTest`
