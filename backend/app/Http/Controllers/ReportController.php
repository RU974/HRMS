<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Payroll;
use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'q' => 'nullable|string|max:100',
            'type' => ['nullable', Rule::in(['attendance', 'employee', 'leave', 'payroll', 'custom'])],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = Report::query()->with(['creator:id,name,email', 'updater:id,name,email']);

        if (!empty($validated['q'])) {
            $query->where(function ($q) use ($validated) {
                $term = '%' . $validated['q'] . '%';
                $q->where('name', 'like', $term)
                    ->orWhere('description', 'like', $term);
            });
        }
        if (!empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }
        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        return $this->ok($query->orderByDesc('created_at')->paginate((int) ($validated['per_page'] ?? 10)));
    }

    public function show($id)
    {
        $report = Report::with(['creator:id,name,email', 'updater:id,name,email'])->findOrFail($id);
        return $this->ok($report);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'type' => ['required', Rule::in(['attendance', 'employee', 'leave', 'payroll', 'custom'])],
            'description' => 'nullable|string|max:1000',
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'filters' => 'nullable|array',
        ]);

        $report = Report::create([
            ...$validated,
            'status' => $validated['status'] ?? 'active',
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return $this->ok($report->load(['creator:id,name,email', 'updater:id,name,email']), 'Report created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $report = Report::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => ['sometimes', Rule::in(['attendance', 'employee', 'leave', 'payroll', 'custom'])],
            'description' => 'nullable|string|max:1000',
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'filters' => 'nullable|array',
            'last_run_at' => 'nullable|date',
        ]);

        $report->update([
            ...$validated,
            'updated_by' => $request->user()?->id,
        ]);

        return $this->ok($report->load(['creator:id,name,email', 'updater:id,name,email']), 'Report updated successfully');
    }

    public function destroy($id)
    {
        Report::findOrFail($id)->delete();
        return $this->ok(null, 'Report deleted successfully');
    }

    public function employees(Request $request)
    {
        $data = Employee::query()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function attendance(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Attendance::whereMonth('date', $validated['month'])
            ->whereYear('date', $validated['year'])
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function leave(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Leave::whereMonth('from_date', $validated['month'])
            ->whereYear('from_date', $validated['year'])
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function payroll(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Payroll::whereMonth('payment_date', $validated['month'])
            ->whereYear('payment_date', $validated['year'])
            ->selectRaw('status, COUNT(*) as total_records, SUM(net_salary) as total_net_salary')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }
}
