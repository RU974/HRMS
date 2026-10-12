# Recruitment browser check

A real-browser pass over the recruitment screens (fit ranking, "select everything matching",
board selection, email templates, merge, headcount budgets, the candidate portal with its
e-signature, reschedule, withdraw and talent-pool consent). The component tests under
`src/test/recruitment` cover the same logic without a browser; this checks it all works together.

It runs against a **scratch database** so dev data is never touched.

```powershell
# 1. Scratch database + data (drops and recreates hrms_scratch2, nothing else)
cd backend
$env:DB_DATABASE = "hrms_scratch2"
php tests/Support/recruitment_e2e_seed.php

# 2. Servers (two terminals); the log mailer writes one-time codes and links to storage/logs
cd backend;  $env:DB_DATABASE = "hrms_scratch2"; php artisan serve --port=8099
cd build;    $env:VITE_BACKEND_URL = "http://127.0.0.1:8099"; npx vite --port 5199

# 3. The check (playwright-core is not a project dependency)
cd build
npm install --no-save playwright-core
node e2e/recruitment-smoke.mjs

# 4. Clean up: stop both servers, then drop the database
php -r '(new PDO("mysql:host=127.0.0.1","root",""))->exec("DROP DATABASE hrms_scratch2");'
```

Overrides: `E2E_BASE`, `E2E_DATA` (seed output), `E2E_MAIL_LOG`, `E2E_OUT`, `CHROME_PATH`.

Notes: every request takes about a second against `artisan serve` on Windows, so the check needs
a few minutes. It exits non-zero when a step fails or the page throws an error.
