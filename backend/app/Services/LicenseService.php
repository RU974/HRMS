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

    /**
     * Return all licenses scoped to the given company (or all for Super Admin).
     */
    public function list(?string $companyId): Collection
    {
        return License::query()
            ->forCompany($companyId)
            ->with('company:id,name')
            ->orderByDesc('created_at')
            ->get();
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    /**
     * Issue a brand-new license, generating a unique key automatically.
     */
    public function create(array $data, ?string $companyId): License
    {
        $license = new License();
        $license->fill($data);
        $license->company_id    = $data['company_id'] ?? $companyId;
        $license->license_key   = License::generateKey();
        $license->issued_at     = now();
        $license->issued_by     = $data['issued_by'] ?? 'Slingshottech';
        $license->support_email = $data['support_email'] ?? 'support@slingshottech.com';
        $license->features      = $data['features'] ?? [];
        $license->metadata      = $data['metadata'] ?? [];
        $license->status        = 'trial';
        $license->is_active     = true;

        $license->save();

        return $license->fresh(['company']);
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    /**
     * Update an existing license.
     * Re-evaluates status after changes to expires_at or activated_at.
     */
    public function update(License $license, array $data): License
    {
        $license->fill($data);

        // Recalculate status whenever expiry or activation timestamps change
        if (isset($data['expires_at']) || isset($data['activated_at'])) {
            $license->recalculateStatus();
        }

        $license->save();

        return $license->fresh(['company']);
    }

    // ─── Activate ─────────────────────────────────────────────────────────────

    /**
     * Activate a license by its key.
     * Looks up across all companies (a key is globally unique).
     *
     * @throws \Illuminate\Database\Eloquent\ModelNotFoundException
     * @throws \RuntimeException
     */
    public function activate(string $licenseKey): License
    {
        $license = License::where('license_key', strtoupper(trim($licenseKey)))->firstOrFail();

        if ($license->status === 'suspended') {
            throw new \RuntimeException('This license has been suspended. Please contact support.');
        }

        if ($license->status === 'expired') {
            throw new \RuntimeException('This license has expired. Please renew or contact support.');
        }

        if ($license->activated_at) {
            // Already activated — just return it (idempotent)
            return $license->load('company');
        }

        $license->activated_at = now();
        $license->status       = 'active';
        $license->is_active    = true;

        // If no explicit expiry was set at issue time, grant 1 year from activation
        if (! $license->expires_at) {
            $license->expires_at = now()->addYear();
        }

        $license->save();

        return $license->fresh(['company']);
    }

    // ─── Usage (single company) ───────────────────────────────────────────────

    /**
     * Return current seat usage alongside the active license for one company.
     * Used by Company Admin and by the per-company drill-down.
     * Response: { active_employees, active_users, license }
     */
    public function usage(?string $companyId): array
    {
        $employeeQuery = Employee::query()->where('status', 'active');
        $userQuery     = User::query();

        if ($companyId) {
            $employeeQuery->whereHas('user', fn ($q) => $q->where('company_id', $companyId));
            $userQuery->where('company_id', $companyId);
        }

        $activeEmployees = $employeeQuery->count();
        $activeUsers     = $userQuery->count();

        // Prefer the most recently activated license; fall back to newest overall
        $license = License::query()
            ->forCompany($companyId)
            ->active()
            ->orderByDesc('activated_at')
            ->orderByDesc('created_at')
            ->with('company:id,name')
            ->first();

        // Auto-expire if the license has passed its expiry date
        if ($license && $license->expires_at?->isPast() && $license->status !== 'expired') {
            $license->status = 'expired';
            $license->save();
        }

        return [
            'active_employees' => $activeEmployees,
            'active_users'     => $activeUsers,
            'license'          => $license,
        ];
    }

    // ─── All-company usage (Super Admin only) ─────────────────────────────────

    /**
     * Return a usage snapshot for every company in the system.
     *
     * Each entry in the returned array:
     *   company_id        — UUID of the company
     *   company_name      — display name
     *   total_employees   — active employee count
     *   total_users       — total user count
     *   license           — the company's active License model (or null)
     *
     * Also returns top-level summary counters:
     *   summary.total_companies
     *   summary.licensed          — companies with an active license
     *   summary.trial             — companies on trial
     *   summary.expiring_soon     — active licenses expiring within 30 days
     *   summary.expired           — companies with an expired license
     *   summary.no_license        — companies with no license at all
     */
    public function allCompanyUsage(): array
    {
        // Load all companies with pre-aggregated user counts in one query
        $companies = Company::query()
            ->where('is_active', true)
            ->withCount('users')
            ->orderBy('name')
            ->get();

        if ($companies->isEmpty()) {
            return [
                'summary' => [
                    'total_companies' => 0,
                    'licensed'        => 0,
                    'trial'           => 0,
                    'expiring_soon'   => 0,
                    'expired'         => 0,
                    'no_license'      => 0,
                ],
                'companies' => [],
            ];
        }

        $companyIds = $companies->pluck('id');

        // Load the best active license per company in a single query,
        // then key them by company_id for O(1) lookup.
        // "Best" = most recently activated, then most recently created.
        $licenses = License::query()
            ->whereIn('company_id', $companyIds)
            ->active()
            ->orderByDesc('activated_at')
            ->orderByDesc('created_at')
            ->get()
            ->unique('company_id')   // keep only the first (best) per company
            ->keyBy('company_id');

        // Auto-expire any licenses whose expiry date has passed
        foreach ($licenses as $license) {
            if ($license->expires_at?->isPast() && $license->status !== 'expired') {
                $license->status = 'expired';
                $license->save();
            }
        }

        // Count active employees per company in one query
        // Employee → User (company_id), so we go through users table
        $employeeCounts = Employee::query()
            ->where('status', 'active')
            ->whereHas('user', fn ($q) => $q->whereIn('company_id', $companyIds))
            ->join('users', 'employees.user_id', '=', 'users.id')
            ->selectRaw('users.company_id, COUNT(employees.id) as total')
            ->groupBy('users.company_id')
            ->pluck('total', 'company_id');

        // ── Build per-company rows ────────────────────────────────────────────
        $rows = [];

        // Summary counters
        $licensed      = 0;
        $trial         = 0;
        $expiringSoon  = 0;
        $expired       = 0;
        $noLicense     = 0;

        foreach ($companies as $company) {
            /** @var \App\Models\License|null $license */
            $license          = $licenses->get($company->id);
            $activeEmployees  = (int) ($employeeCounts[$company->id] ?? 0);
            $totalUsers       = $company->users_count;

            // Tally summary
            if (! $license) {
                $noLicense++;
            } elseif ($license->status === 'expired') {
                $expired++;
            } elseif ($license->status === 'trial') {
                $trial++;
            } else {
                // active
                $licensed++;
                if ($license->days_remaining !== null && $license->days_remaining <= 30) {
                    $expiringSoon++;
                }
            }

            $rows[] = [
                'company_id'       => $company->id,
                'company_name'     => $company->name,
                'total_employees'  => $activeEmployees,
                'total_users'      => $totalUsers,
                'license'          => $license,
            ];
        }

        return [
            'summary' => [
                'total_companies' => $companies->count(),
                'licensed'        => $licensed,
                'trial'           => $trial,
                'expiring_soon'   => $expiringSoon,
                'expired'         => $expired,
                'no_license'      => $noLicense,
            ],
            'companies' => $rows,
        ];
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    /**
     * Soft-delete a license by marking it inactive rather than hard-deleting.
     * This preserves the audit trail.
     */
    public function delete(License $license): void
    {
        $license->is_active = false;
        $license->save();
    }
}