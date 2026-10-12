<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Shift;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ShiftController extends Controller
{
    public function index(Request $request)
    {
        $query = Shift::query()->with('departmentGraces:id,shift_id,department_id,grace_minutes');
        $this->scopeToCompany($request, $query);
        return $this->ok($query->orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $request->user()->company_id;
        $validated = $request->validate([
            'name'          => ['required', 'string', 'max:120', Rule::unique('shifts', 'name')->where('company_id', $companyId)],
            'start_time'    => 'required|date_format:H:i,H:i:s',
            'end_time'      => 'required|date_format:H:i,H:i:s',
            'working_days'  => 'required|array|min:1|max:7',
            'working_days.*' => 'integer|between:1,7|distinct',
            'grace_minutes' => 'nullable|integer|min:0|max:180',
            'is_active'     => 'nullable|boolean',
            ...$this->departmentGraceRules(),
        ]);
        $graces = $validated['department_graces'] ?? null;
        unset($validated['department_graces']);

        $shift = Shift::create([
            ...$validated,
            'company_id'    => $companyId,
            'grace_minutes' => $validated['grace_minutes'] ?? 0,
            'is_active'     => $validated['is_active'] ?? true,
        ]);
        $this->syncDepartmentGraces($shift, $graces, $companyId);

        return $this->ok($shift->load('departmentGraces'), 'Shift created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $query = Shift::query()->with('departmentGraces:id,shift_id,department_id,grace_minutes');
        $this->scopeToCompany($request, $query);
        return $this->ok($query->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $request->user()->company_id;
        $query     = Shift::query();
        $this->scopeToCompany($request, $query);
        $shift     = $query->findOrFail($id);
        $validated = $request->validate([
            'name'          => ['sometimes', 'string', 'max:120', Rule::unique('shifts', 'name')->ignore($id)->where('company_id', $companyId)],
            'start_time'    => 'sometimes|date_format:H:i,H:i:s',
            'end_time'      => 'sometimes|date_format:H:i,H:i:s',
            'working_days'  => 'sometimes|array|min:1|max:7',
            'working_days.*' => 'integer|between:1,7|distinct',
            'grace_minutes' => 'sometimes|integer|min:0|max:180',
            'is_active'     => 'sometimes|boolean',
            ...$this->departmentGraceRules(),
        ]);
        $graces = $validated['department_graces'] ?? null;
        unset($validated['department_graces']);

        $shift->update($validated);
        // Only touch overrides when the client sent the key (an empty array clears them).
        if ($request->has('department_graces')) {
            $this->syncDepartmentGraces($shift, $graces ?? [], $companyId);
        }

        return $this->ok($shift->load('departmentGraces'), 'Shift updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $query = Shift::query();
        $this->scopeToCompany($request, $query);
        $query->findOrFail($id)->delete();
        return $this->ok(null, 'Shift deleted successfully');
    }

    private function departmentGraceRules(): array
    {
        return [
            'department_graces'                 => 'nullable|array',
            'department_graces.*.department_id' => 'required|integer|distinct',
            'department_graces.*.grace_minutes' => 'required|integer|min:0|max:180',
        ];
    }

    /**
     * Replace the shift's per-department grace overrides. Departments are
     * restricted to the caller's company.
     */
    private function syncDepartmentGraces(Shift $shift, ?array $graces, $companyId): void
    {
        if ($graces === null) {
            return;
        }

        $allowed = Department::query()
            ->where('company_id', $companyId)
            ->whereIn('id', array_column($graces, 'department_id'))
            ->pluck('id')
            ->all();

        $rows = collect($graces)
            ->filter(fn ($g) => in_array((int) $g['department_id'], $allowed, true))
            ->map(fn ($g) => [
                'department_id' => (int) $g['department_id'],
                'grace_minutes' => (int) $g['grace_minutes'],
            ]);

        $shift->departmentGraces()->whereNotIn('department_id', $rows->pluck('department_id'))->delete();
        foreach ($rows as $row) {
            $shift->departmentGraces()->updateOrCreate(
                ['department_id' => $row['department_id']],
                ['grace_minutes' => $row['grace_minutes']]
            );
        }
    }
}
