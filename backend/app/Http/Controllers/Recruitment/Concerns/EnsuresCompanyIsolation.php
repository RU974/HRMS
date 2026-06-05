<?php

namespace App\Http\Controllers\Recruitment\Concerns;

use App\Models\Scopes\CompanyScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

trait EnsuresCompanyIsolation
{
    protected function resolveTenantModel(string $modelClass, mixed $id): Model
    {
        $model = $modelClass::withoutGlobalScope(CompanyScope::class)->findOrFail($id);
        $this->assertSameCompany($model);

        return $model;
    }

    protected function assertSameCompany(Model $model): void
    {
        $companyId = request()->user()?->company_id;
        if ($companyId === null) {
            if ($model->company_id !== null) {
                abort(403, 'Forbidden: cross-company access denied.');
            }

            return;
        }

        if ((string) $model->company_id !== (string) $companyId) {
            abort(403, 'Forbidden: cross-company access denied.');
        }
    }
}
