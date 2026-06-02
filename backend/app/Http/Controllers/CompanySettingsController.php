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
        $this->authorizePermission($request, 'manage settings');
        return $this->ok(Company::query()->withCount(['branches', 'users'])->orderBy('name')->get());
    }

    public function show(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
        return $this->ok(Company::withCount(['branches', 'users'])->findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage settings');
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'website' => 'nullable|url|max:255',
            'address' => 'nullable|string',
            'timezone' => 'nullable|string|max:80',
            'is_active' => 'nullable|boolean',
        ]);

        return $this->ok($this->service->upsert(null, $validated), 'Company created successfully', 201);
    }

    public function update(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
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
        $this->authorizePermission($request, 'manage settings');
        $company = Company::withCount(['branches', 'users'])->findOrFail($id);

        if ($company->branches_count > 0 || $company->users_count > 0) {
            return $this->fail('Move or remove related users and branches before deleting the company.', 422);
        }

        $company->delete();
        return $this->ok(null, 'Company deleted successfully');
    }
}
