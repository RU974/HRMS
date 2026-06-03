<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Services\BranchService;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    public function __construct(private readonly BranchService $service)
    {
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'manage settings');
        $q = Branch::query()->with('company')->withCount('users')->orderBy('name');
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            if ($request->filled('company_id') && (string) $request->input('company_id') !== (string) $companyId) {
                abort(403, 'You are not authorized to access this branch.');
            }

            $q->where('company_id', $companyId);
        } elseif ($request->filled('company_id')) {
            $q->where('company_id', (string) $request->input('company_id'));
        }
        return $this->ok($q->get());
    }

    public function show(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $branch = Branch::with('company')->withCount('users')->findOrFail($id);
        $this->assertCompanyAccess($request, $branch);

        return $this->ok($branch);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage settings');
        $validated = $request->validate([
            'company_id' => 'required|uuid|exists:companies,id',
            'name' => ['required', 'string', 'max:255'],
            'code' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        $this->normalizeCompanyPayload($request, $validated);

        return $this->ok($this->service->create($validated), 'Branch created successfully', 201);
    }

    public function update(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $branch = Branch::findOrFail($id);
        $this->assertCompanyAccess($request, $branch);
        $validated = $request->validate([
            'company_id' => 'sometimes|required|uuid|exists:companies,id',
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        $this->normalizeCompanyPayload($request, $validated);

        return $this->ok($this->service->update($branch, $validated), 'Branch updated successfully');
    }

    public function destroy(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $branch = Branch::withCount('users')->findOrFail($id);
        $this->assertCompanyAccess($request, $branch);

        if ($branch->users_count > 0) {
            return $this->fail('Move or remove users assigned to this branch before deleting it.', 422);
        }

        $branch->delete();
        return $this->ok(null, 'Branch deleted successfully');
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function normalizeCompanyPayload(Request $request, array &$validated): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if (!empty($validated['company_id']) && (string) $validated['company_id'] !== (string) $companyId) {
            abort(403, 'You are not authorized to assign this branch to another company.');
        }

        $validated['company_id'] = $companyId;
    }

    private function assertCompanyAccess(Request $request, Branch $branch): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if ((string) $branch->company_id !== (string) $companyId) {
            abort(403, 'You are not authorized to access this branch.');
        }
    }
}
