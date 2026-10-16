<?php

namespace App\Services;

use App\Models\AttendancePolicy;

/**
 * Finds the attendance policy that applies to a company: its own row if it has saved one,
 * otherwise the global default (company_id NULL). Registered as a scoped service so a page
 * of rows reads each policy once per request/job instead of once per row.
 */
class AttendancePolicyResolver
{
    /** @var array<string, ?AttendancePolicy> */
    private array $resolved = [];

    public function forCompany(?string $companyId): ?AttendancePolicy
    {
        $key = $companyId ?: '_global';

        if (!array_key_exists($key, $this->resolved)) {
            $this->resolved[$key] = ($companyId
                    ? AttendancePolicy::query()->where('company_id', $companyId)->orderBy('id')->first()
                    : null)
                ?? AttendancePolicy::query()->whereNull('company_id')->orderBy('id')->first();
        }

        return $this->resolved[$key];
    }

    public function forget(): void
    {
        $this->resolved = [];
    }
}
