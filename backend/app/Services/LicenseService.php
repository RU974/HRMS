<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Employee;
use App\Models\License;
use App\Models\User;
use Illuminate\Support\Collection;

class LicenseService
{
    // ─── List ─────────────────────────────────────────────────────────────────

    public function list(?string $companyId): Collection
    {
        return License::query()
            ->forCompany($companyId)
            ->where('is_active', true)
            ->with('company:id,name')
            ->orderByDesc('created_at')
            ->get();
    }

    // ─── Edition defaults ─────────────────────────────────────────────────────

    private function editionDefaults(string $edition): array
    {
        $editions = config('licenses.editions', []);

        return $editions[$edition] ?? [
            'max_employees' => 20,
            'max_users'     => null,
            'features'      => ['attendance', 'leaves'],
        ];
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    public function create(array $data, ?string $companyId): License
    {
        $targetCompanyId = $data['company_id'] ?? $companyId;

        // Prevent issuing a second active/trial license to the same company.
        // One company, one active license — additional keys must be issued only
        // after the existing one is revoked or expired.
        if ($targetCompanyId) {
            $hasActive = License::where('company_id', $targetCompanyId)
                ->where('is_active', true)
                ->whereIn('status', ['active', 'trial'])
                ->exists();

            if ($hasActive) {
                throw new \RuntimeException(
                    'This company already has an active or trial license. Revoke or let the existing license expire before issuing a new one.'
                );
            }
        }

        $edition  = $data['edition'] ?? 'Starter';
        $defaults = $this->editionDefaults($edition);

        $license = new License();
        $license->fill($data);
        $license->company_id    = $data['company_id'] ?? $companyId;
        $license->license_key   = License::generateKey();
        $license->issued_at     = now();
        $license->issued_by     = $data['issued_by'] ?? config('licenses.issued_by');
        $license->support_email = $data['support_email'] ?? config('licenses.support_email');
        // Fall back to edition defaults when values are absent from the request
        $license->max_employees = array_key_exists('max_employees', $data) ? $data['max_employees'] : $defaults['max_employees'];
        $license->max_users     = array_key_exists('max_users', $data)     ? $data['max_users']     : $defaults['max_users'];
        $license->features      = !empty($data['features']) ? $data['features'] : $defaults['features'];
        $license->metadata      = $data['metadata'] ?? [];
        $license->status        = 'trial';
        $license->is_active     = true;

        $license->save();

        return $license->fresh(['company']);
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    public function update(License $license, array $data): License
    {
        // `status` is intentionally not mass-assignable here — it is derived by
        // recalculateStatus() or set explicitly via the dedicated suspend()/
        // unsuspend()/activate() flows, so it can't be bypassed into an invalid
        // state through this generic update endpoint.
        $license->fill($data);
        // recalculateStatus() auto-persists via saveQuietly() when the record exists.
        $license->recalculateStatus();

        return $license->fresh(['company']);
    }

    // ─── Activate ─────────────────────────────────────────────────────────────

    public function activate(string $licenseKey, ?string $callerCompanyId = null): License
    {
        $license = License::where('license_key', strtoupper(trim($licenseKey)))->firstOrFail();

        // Tribe check: a company-scoped caller can only activate keys that belong to their company.
        if ($callerCompanyId && $license->company_id && $license->company_id !== $callerCompanyId) {
            throw new \RuntimeException('This license key does not belong to your company.');
        }

        // Revoked licenses (is_active = false) can never be re-activated.
        if (! $license->is_active) {
            throw new \RuntimeException('This license has been revoked and cannot be activated. Please contact support.');
        }

        if ($license->status === 'suspended') {
            throw new \RuntimeException('This license has been suspended. Please contact support.');
        }

        if ($license->status === 'expired') {
            throw new \RuntimeException('This license has expired. Please renew or contact support.');
        }

        if ($license->activated_at) {
            return $license->load('company');
        }

        // Claim unassigned key: stamp the caller's company before any further checks
        // so the one-active-license guard below uses the correct company scope.
        if ($callerCompanyId && ! $license->company_id) {
            $license->company_id = $callerCompanyId;
        }

        if ($license->company_id) {
            $hasOtherActive = License::where('company_id', $license->company_id)
                ->where('id', '!=', $license->id)
                ->where('is_active', true)
                ->whereIn('status', ['active', 'trial'])
                ->exists();

            if ($hasOtherActive) {
                throw new \RuntimeException('This company already has an active license. Please revoke or let the existing license expire before activating a new one.');
            }
        }

        $license->activated_at = now();
        $license->status       = 'active';
        $license->is_active    = true;

        if (! $license->expires_at) {
            $license->expires_at = now()->addYear();
        }

        $license->save();

        return $license->fresh(['company']);
    }

    // ─── Seat-limit guards ────────────────────────────────────────────────────

    /**
     * Core seat-check logic shared by canAddEmployee() and assertCanAddEmployee().
     * Returns null when the add is permitted, or an error message string when it
     * should be blocked. Keeping the decision in one place means callers never
     * drift out of sync.
     */
    private function resolveEmployeeSeatCheck(?string $companyId, int $adding = 1): ?string
    {
        // Super Admins (company_id = null) are never seat-limited.
        if ($companyId === null) {
            return null;
        }

        $license = License::query()
            ->forCompany($companyId)
            ->active()
            ->orderByDesc('created_at')
            ->first();

        if (! $license) {
            // No license on file — fail-open so new tenants can onboard before
            // a license is formally issued. Enforcement begins once a license
            // record exists (active, trial, expired, or suspended).
            return null;
        }

        if ($license->status === 'suspended') {
            return 'Your license has been suspended. New employees cannot be added until it is reinstated. Please contact support.';
        }

        if ($license->status === 'expired') {
            return 'Your license has expired. New employees cannot be added until the license is renewed.';
        }

        // active or trial — enforce seat cap when set
        if ($license->max_employees === null) {
            return null;
        }

        $count = Employee::where('status', 'active')
            ->where('company_id', $companyId)
            ->count();

        if (($count + $adding) > $license->max_employees) {
            return "Employee limit of {$license->max_employees} reached on your {$license->edition} plan. Upgrade to add more employees.";
        }

        return null;
    }

    public function canAddEmployee(?string $companyId = null, int $adding = 1): bool
    {
        return $this->resolveEmployeeSeatCheck($companyId, $adding) === null;
    }

    /**
     * Throws when a new employee add must be blocked (fail-closed for
     * expired/suspended licenses; fail-open when no license exists at all).
     * Catch \RuntimeException at call sites and return HTTP 422.
     */
    public function assertCanAddEmployee(?string $companyId, int $adding = 1): void
    {
        $message = $this->resolveEmployeeSeatCheck($companyId, $adding);

        if ($message !== null) {
            throw new \RuntimeException($message);
        }
    }

    public function canAddUser(?string $companyId = null): bool
    {
        $license = License::query()
            ->forCompany($companyId)
            ->active()
            ->whereIn('status', ['active', 'trial'])
            ->orderByDesc('created_at')
            ->first();

        if (! $license) {
            // Super Admins have no company_id and are never seat-limited.
            // A real company with no active/trial license must be blocked.
            return $companyId === null;
        }
        if ($license->max_users === null) {
            return true;
        }

        // Exclude users who are also employees — they are counted against
        // max_employees, not max_users, matching allCompanyUsage counting.
        $count = User::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->whereDoesntHave('roles', fn ($q) => $q->where('name', User::ROLE_SUPER_ADMIN))
            ->whereDoesntHave('employee')
            ->count();

        return $count < $license->max_users;
    }

    // ─── Usage (single company) ───────────────────────────────────────────────

    public function usage(?string $companyId): array
    {
        $employeeQuery = Employee::query()->where('status', 'active');
        $userQuery     = User::query()
            ->whereDoesntHave('roles', fn ($q) => $q->where('name', User::ROLE_SUPER_ADMIN))
            ->whereDoesntHave('employee');

        if ($companyId) {
            $employeeQuery->where('company_id', $companyId);
            $userQuery->where('company_id', $companyId);
        }

        $activeEmployees = $employeeQuery->count();
        $activeUsers     = $userQuery->count();

        $license = License::query()
            ->forCompany($companyId)
            ->active()
            ->orderByDesc('activated_at')
            ->orderByDesc('created_at')
            ->with('company:id,name')
            ->first();

        $license?->reflectExpiry();

        return [
            'active_employees' => $activeEmployees,
            'active_users'     => $activeUsers,
            'license'          => $license,
        ];
    }

    // ─── All-company usage (Super Admin only) ─────────────────────────────────

    /**
     * Return a paginated usage snapshot for every company.
     *
     * Summary counters are computed globally (all companies) via fast scalar
     * DB aggregates so the KPI cards stay accurate across pages.
     *
     * Each company row includes:
     *   company_id, company_name, total_employees, total_users,
     *   license (current active), license_history (all other licenses)
     */
    public function allCompanyUsage(int $page = 1, int $perPage = 25, string $search = ''): array
    {
        // ── Global summary (all companies, not just this page) ────────────────
        $totalCompanies       = Company::where('is_active', true)->count();
        $companiesWithLicense = License::where('is_active', true)->distinct()->count('company_id');

        $licensed     = License::where('is_active', true)->where('status', 'active')->distinct()->count('company_id');
        $trial        = License::where('is_active', true)->where('status', 'trial')->distinct()->count('company_id');
        $expired      = License::where('is_active', true)->where('status', 'expired')->distinct()->count('company_id');
        $suspended    = License::where('is_active', true)->where('status', 'suspended')->distinct()->count('company_id');
        $expiringSoon = License::where('is_active', true)
            ->where('status', 'active')
            ->whereNotNull('expires_at')
            ->where('expires_at', '>', now())
            ->where('expires_at', '<=', now()->addDays(30))
            ->distinct()
            ->count('company_id');

        $summary = [
            'total_companies' => $totalCompanies,
            'licensed'        => $licensed,
            'trial'           => $trial,
            'expiring_soon'   => $expiringSoon,
            'expired'         => $expired,
            'suspended'       => $suspended,
            'no_license'      => max(0, $totalCompanies - $companiesWithLicense),
        ];

        if ($totalCompanies === 0) {
            return [
                'summary'    => $summary,
                'companies'  => [],
                'pagination' => ['current_page' => 1, 'last_page' => 1, 'per_page' => $perPage, 'total' => 0],
            ];
        }

        // ── Paginated company rows ────────────────────────────────────────────
        $paginator = Company::query()
            ->where('is_active', true)
            ->when($search !== '', fn ($q) => $q->where('name', 'LIKE', "%{$search}%"))
            ->withCount(['users' => fn ($q) => $q
                ->whereDoesntHave('employee')
                ->whereDoesntHave('roles', fn ($r) => $r->where('name', User::ROLE_SUPER_ADMIN)),
            ])
            ->orderBy('name')
            ->paginate($perPage, ['*'], 'page', $page);

        $companies  = collect($paginator->items());
        $companyIds = $companies->pluck('id');

        // All licenses for this page's companies (active + revoked) for history
        $allLicenses = License::query()
            ->whereIn('company_id', $companyIds)
            ->orderByDesc('activated_at')
            ->orderByDesc('created_at')
            ->get()
            ->groupBy('company_id');

        // Active employee counts restricted to this page's companies only
        $employeeCounts = Employee::query()
            ->where('status', 'active')
            ->whereIn('company_id', $companyIds)
            ->selectRaw('company_id, COUNT(id) as total')
            ->groupBy('company_id')
            ->pluck('total', 'company_id');

        $rows = [];

        foreach ($companies as $company) {
            /** @var \Illuminate\Support\Collection $companyLicenses */
            $companyLicenses = $allLicenses->get($company->id, collect());

            // Current license = first record that is still active (not revoked)
            $license = $companyLicenses->first(fn ($l) => $l->is_active);

            $license?->reflectExpiry();

            // History = everything except the current license
            $history = $companyLicenses
                ->filter(fn ($l) => $l->id !== $license?->id)
                ->values();

            $rows[] = [
                'company_id'      => $company->id,
                'company_name'    => $company->name,
                'total_employees' => (int) ($employeeCounts[$company->id] ?? 0),
                'total_users'     => (int) $company->users_count,
                'license'         => $license,
                'license_history' => $history,
            ];
        }

        return [
            'summary'    => $summary,
            'companies'  => $rows,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ];
    }

    // ─── Renew ────────────────────────────────────────────────────────────────

    public function renew(License $license): License
    {
        if (! $license->is_active) {
            throw new \RuntimeException('This license has been revoked and cannot be renewed. Please contact support.');
        }

        if ($license->status === 'suspended') {
            throw new \RuntimeException('This license is currently suspended. Please contact support to renew.');
        }

        // Extend by one year from the later of today or the current expiry date,
        // so renewal on an already-future expiry stacks rather than resets.
        $base = ($license->expires_at && $license->expires_at->isFuture())
            ? $license->expires_at->copy()
            : now();

        $license->expires_at = $base->addYear();

        // Transition expired or unactivated trial to active.
        if (in_array($license->status, ['expired', 'trial'], true)) {
            $license->activated_at ??= now();
            $license->status = 'active';
        }

        $license->save();

        return $license->fresh(['company']);
    }

    // ─── Suspend / Unsuspend ──────────────────────────────────────────────────

    public function suspend(License $license): License
    {
        $license->status = 'suspended';
        $license->save();
        return $license->fresh(['company']);
    }

    public function unsuspend(License $license): License
    {
        // Inline the status calculation rather than setting status = null
        // as an intermediate: the column is a non-nullable enum and a
        // mid-flight exception would try to persist an invalid null value.
        if ($license->expires_at?->isPast()) {
            $license->status = 'expired';
        } elseif ($license->activated_at) {
            $license->status = 'active';
        } else {
            $license->status = 'trial';
        }

        $license->save();
        return $license->fresh(['company']);
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    /**
     * Soft-delete a license by marking it inactive. The key remains in the
     * audit trail but can never be re-activated (activate() checks is_active).
     */
    public function delete(License $license): void
    {
        $license->is_active = false;
        $license->save();
    }
}
