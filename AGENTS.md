# AGENTS.md

Guidance for coding agents working in this repository.

## Workspace Layout

- `build/` is the React frontend application.
- `backend/` is the Laravel/PHP backend application.
- Keep frontend and backend changes scoped to their directories unless the task explicitly requires integration work.

## Frontend

The frontend is in `build/` and uses:

- React 19
- Vite
- TypeScript
- Tailwind CSS v4
- React Router
- Zustand
- TanStack React Query
- Framer Motion
- Lucide Icons
- Shadcn-style component primitives

Important paths:

- `build/src/main.tsx` is the React entrypoint.
- `build/src/app/routes/app-routes.tsx` defines routes.
- `build/src/app/layouts/app-layout.tsx` defines the authenticated app shell.
- `build/src/components/` contains reusable UI, forms, tables, navigation, modals, loaders, and dashboard primitives.
- `build/src/modules/` contains feature pages.
- `build/src/store/` contains Zustand stores.
- `build/src/styles/theme.css` contains theme tokens and Tailwind import.

Common commands:

```powershell
cd build
npm.cmd run dev
npm.cmd run build
npx.cmd tsc --noEmit
```

Use `npm.cmd run build` and `npx.cmd tsc --noEmit` after meaningful frontend changes.

## Backend

The backend is in `backend/` and appears to be a Laravel application.

Important paths:

- `backend/routes/`
- `backend/app/`
- `backend/config/`
- `backend/database/`
- `backend/tests/`

Important backend commands:

- `cd backend`
- `php artisan migrate --seed`
- `php artisan db:seed --class=DatabaseSeeder`
- `php artisan serve --host=127.0.0.1 --port=8000`

Notes:

- `backend/.env` contains backend environment settings and default admin credentials for seeding.
- `build/vite.config.ts` proxies `/api` to the Laravel backend by default.
- The API login route is implemented in `backend/routes/api.php` at `/api/auth/login`.

Do not modify `backend/vendor/` manually.

## Design Standards

Maintain the HRMS frontend as a premium enterprise SaaS interface:

- Quiet, dense, organized dashboard layouts.
- Responsive desktop, laptop, tablet, and mobile behavior.
- Sticky top navigation and collapsible sidebar behavior.
- Light/dark theme support through CSS variables and Zustand.
- Reusable components before page-specific duplication.
- Smooth but restrained Framer Motion animations.
- Lucide icons for recognizable UI actions.
- Accessible buttons, labels, and keyboard-friendly controls.

Avoid:

- Marketing landing-page layouts for app screens.
- Decorative visual noise that reduces scanning speed.
- Large unrelated refactors.
- Reverting user changes without explicit approval.

## Code Conventions

- Prefer TypeScript for all new frontend files.
- Use the `@/*` alias for imports from `build/src`.
- Keep components small and reusable.
- Keep page modules focused on composition and feature data.
- Use Zustand for client UI state and TanStack Query for server state.
- Use `cn()` from `build/src/utils/cn.ts` for conditional Tailwind classes.
- Keep comments sparse and only add them when they explain non-obvious behavior.

## Git And File Safety

- Do not run destructive git commands unless the user explicitly requests them.
- Do not overwrite unrelated user changes.
- Do not edit generated dependency directories such as `node_modules/` or `vendor/`.
- If a command fails because of sandbox or permissions, request escalation instead of working around it unsafely.

## Verification Checklist

Before handing off frontend work:

1. Run `npm.cmd run build` from `build/`.
2. Run `npx.cmd tsc --noEmit` from `build/`.
3. Confirm responsive layout behavior if UI structure changed.
4. Mention any command that could not be run.

