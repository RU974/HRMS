Start the Laravel development server.

```powershell
cd backend
php artisan serve
```

Backend will be available at http://localhost:8000.

Also start the queue worker in a separate process — jobs like payroll generation (`QUEUE_CONNECTION=database`) are dispatched to the `jobs` table and never run without a worker:

```powershell
cd backend
php artisan queue:listen --tries=1 --timeout=0
```
