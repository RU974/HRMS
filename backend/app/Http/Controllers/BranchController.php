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
        if ($request->filled('company_id')) {
            $q->where('company_id', (string) $request->input('company_id'));
        }
        return $this->ok($q->get());
    }

    public function show(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
        return $this->ok(Branch::with('company')->withCount('users')->findOrFail($id));
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

        return $this->ok($this->service->create($validated), 'Branch created successfully', 201);
    }

    public function update(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $branch = Branch::findOrFail($id);
        $validated = $request->validate([
            'company_id' => 'sometimes|required|uuid|exists:companies,id',
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        return $this->ok($this->service->update($branch, $validated), 'Branch updated successfully');
    }

    public function destroy(Request $request, string $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $branch = Branch::withCount('users')->findOrFail($id);

        if ($branch->users_count > 0) {
            return $this->fail('Move or remove users assigned to this branch before deleting it.', 422);
        }

        $branch->delete();
        return $this->ok(null, 'Branch deleted successfully');
    }
}
