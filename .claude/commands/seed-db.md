Seed the database. Pass `--fresh` to wipe and re-migrate first.

```powershell
cd backend
php artisan $ARGUMENTS db:seed
```

Examples:
- Normal seed: (no arguments)
- Fresh seed: `migrate:fresh --seed` (replaces `db:seed`)
- Single seeder: `db:seed --class=RoleSeeder`
