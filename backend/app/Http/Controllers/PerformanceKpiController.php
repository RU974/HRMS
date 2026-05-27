<?php

namespace App\Http\Controllers;

use App\Models\PerformanceKpi;
use Illuminate\Http\Request;

class PerformanceKpiController extends Controller
{
    public function index(Request $request)
    {
        $query = PerformanceKpi::query()->with('employee:id,first_name,last_name,employee_code');

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('unit', 'like', "%{$search}%");
            });
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'name' => 'required|string|max:255',
            'target_value' => 'required|numeric|min:0',
            'current_value' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
        ]);

        $item = PerformanceKpi::create([
            ...$validated,
            'current_value' => $validated['current_value'] ?? 0,
            'unit' => $validated['unit'] ?? '%',
        ]);

        return $this->ok($item->load('employee:id,first_name,last_name,employee_code'), 'Performance KPI created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(PerformanceKpi::with('employee:id,first_name,last_name,employee_code')->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $item = PerformanceKpi::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'name' => 'sometimes|string|max:255',
            'target_value' => 'sometimes|numeric|min:0',
            'current_value' => 'sometimes|numeric|min:0',
            'unit' => 'sometimes|string|max:50',
        ]);

        $item->update($validated);
        return $this->ok($item->load('employee:id,first_name,last_name,employee_code'), 'Performance KPI updated successfully');
    }

    public function destroy($id)
    {
        PerformanceKpi::findOrFail($id)->delete();
        return $this->ok(null, 'Performance KPI deleted successfully');
    }
}
