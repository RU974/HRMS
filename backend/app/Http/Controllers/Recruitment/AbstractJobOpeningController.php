<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\JobOpening;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

abstract class AbstractJobOpeningController extends Controller
{
    use EnsuresCompanyIsolation;

    private function validateDepartmentExists(Request $request, string $field = 'department_id')
    {
        return Rule::exists('departments', 'id');
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'view recruitment');

        $query = JobOpening::with('department')->latest();

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('title', 'like', "%{$q}%")
                    ->orWhere('location', 'like', "%{$q}%")
                    ->orWhere('employment_type', 'like', "%{$q}%");
            });
        }

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage recruitment');

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'department_id' => ['nullable', $this->validateDepartmentExists($request)],
            'employment_type' => 'nullable|in:full_time,part_time,contract,internship',
            'location' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|in:open,closed,on_hold',
            'open_positions' => 'nullable|integer|min:1|max:1000',
            'posted_at' => 'nullable|date',
            'closed_at' => 'nullable|date|after_or_equal:posted_at',
        ]);

        $job = JobOpening::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
            'employment_type' => $validated['employment_type'] ?? 'full_time',
            'status' => $validated['status'] ?? 'open',
            'open_positions' => $validated['open_positions'] ?? 1,
        ]);

        return $this->ok($job->load('department'), 'Job opening created successfully', 201);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'view recruitment');

        return $this->ok($this->resolveTenantModel(JobOpening::class, $id)->load(['department', 'candidates']));
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['manage recruitment', 'edit recruitment']);

        $job = $this->resolveTenantModel(JobOpening::class, $id);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'department_id' => ['sometimes', 'nullable', $this->validateDepartmentExists($request)],
            'employment_type' => 'sometimes|in:full_time,part_time,contract,internship',
            'location' => 'sometimes|nullable|string|max:255',
            'description' => 'sometimes|nullable|string',
            'status' => 'sometimes|in:open,closed,on_hold',
            'open_positions' => 'sometimes|integer|min:1|max:1000',
            'posted_at' => 'sometimes|nullable|date',
            'closed_at' => 'sometimes|nullable|date|after_or_equal:posted_at',
        ]);

        $job->update($validated);

        return $this->ok($job->load('department'), 'Job opening updated successfully');
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'manage recruitment');

        $this->resolveTenantModel(JobOpening::class, $id)->delete();

        return $this->ok(null, 'Job opening deleted successfully');
    }
}
