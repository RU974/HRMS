<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Services\CompanySettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
            'logo' => 'nullable|image|max:5120',
            'remove_logo' => 'nullable|boolean',
        ]);

        $validated = $this->applyLogo($request, $validated);

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
            'logo' => 'nullable|image|max:5120',
            'remove_logo' => 'nullable|boolean',
        ]);

        $validated = $this->applyLogo($request, $validated, $company);

        return $this->ok($this->service->upsert($id, $validated), 'Company updated successfully');
    }

    /**
     * Uploads a new logo (storing it in the public disk) or clears it when
     * remove_logo is set, and folds the result into logo_path.
     */
    private function applyLogo(Request $request, array $validated, ?Company $company = null): array
    {
        if ($request->hasFile('logo')) {
            if ($company?->logo_path) {
                Storage::disk('public')->delete($company->logo_path);
            }
            $validated['logo_path'] = Storage::disk('public')->putFile('company-logos', $request->file('logo'));
        } elseif ($request->boolean('remove_logo')) {
            if ($company?->logo_path) {
                Storage::disk('public')->delete($company->logo_path);
            }
            $validated['logo_path'] = null;
        }

        unset($validated['logo'], $validated['remove_logo']);

        return $validated;
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