<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Services\CompanySettingsService;
use Illuminate\Http\Request;

class CompanySettingsController extends Controller
{
    public function __construct(private readonly CompanySettingsService $service)
    {
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $query = Company::query()->withCount(['branches', 'users'])->orderBy('name');
        if ($request->user()?->company_id) {
            $query->whereKey($request->user()->company_id);
        }

        return $this->ok($query->get());
    }

    public function show(Request $request, string $id)
    {
        $user = $request->user();

        // Any authenticated user can view their own company
        $isOwnCompany = $user?->company_id && (string) $user->company_id === (string) $id;

        if (!$isOwnCompany) {
            $this->authorizePermission($request, 'settings:manage_settings');
        }

        $company = Company::withCount(['branches', 'users'])->findOrFail($id);
        $this->assertCompanyAccess($request, $company);

        return $this->ok($company);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'website' => 'nullable|url|max:255',
            'address' => 'nullable|string',
            'timezone' => 'nullable|string|max:80',
            'is_active' => 'nullable|boolean',
        ]);

        $companyId = $request->user()?->company_id;
        $company = $this->service->upsert($companyId, $validated);

        return $this->ok($company, $companyId ? 'Company updated successfully' : 'Company created successfully', $companyId ? 200 : 201);
    }

    public function update(Request $request, string $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $company = Company::findOrFail($id);
        $this->assertCompanyAccess($request, $company);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'website' => 'nullable|url|max:255',
            'address' => 'nullable|string',
            'timezone' => 'nullable|string|max:80',
            'is_active' => 'nullable|boolean',
        ]);

        return $this->ok($this->service->upsert($id, $validated), 'Company updated successfully');
    }

    public function destroy(Request $request, string $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $company = Company::withCount(['branches', 'users'])->findOrFail($id);
        $this->assertCompanyAccess($request, $company);

        if ($company->branches_count > 0 || $company->users_count > 0) {
            return $this->fail('Move or remove related users and branches before deleting the company.', 422);
        }

        $company->delete();
        return $this->ok(null, 'Company deleted successfully');
    }

    private function assertCompanyAccess(Request $request, Company $company): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if ((string) $company->id !== (string) $companyId) {
            abort(403, 'You are not authorized to access this company.');
        }
    }
}