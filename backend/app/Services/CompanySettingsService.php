<?php

namespace App\Services;

use App\Models\Company;

class CompanySettingsService
{
    public function upsert(?string $companyId, array $data): Company
    {
        if ($companyId) {
            $company = Company::findOrFail($companyId);
            $company->update($data);
            return $company->fresh();
        }

        return Company::create($data);
    }
}
