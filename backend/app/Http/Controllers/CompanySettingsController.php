<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\User;
use App\Services\CompanySettingsService;
use Illuminate\Http\Request;

class CompanySettingsController extends Controller
{
    private const ADMIN_ROLES = [User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN, User::ROLE_HR_MANAGER];

    public function __construct(private readonly CompanySettingsService $service)
    {
    }

    public function index(Request $request)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        return $this->ok(Company::query()->orderBy('name')->get());
    }

    public function show(Request $request, string $id)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        return $this->ok(Company::findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
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
        $this->authorizeRoles($request, self::ADMIN_ROLES);
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
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        Company::findOrFail($id)->delete();
        return $this->ok(null, 'Company deleted successfully');
    }
}
