<?php

namespace App\Http\Controllers;

use App\Models\PayrollProcessing;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class PayrollProcessingController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'process payroll');
        $query = PayrollProcessing::query();

        if ($request->filled('month')) {
            $query->where('month', (int) $request->query('month'));
        }
        if ($request->filled('year')) {
            $query->where('year', (int) $request->query('year'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return $this->ok($query->latest()->paginate(15));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'process payroll');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020',
            'status' => 'required|in:draft,processing,completed,cancelled',
            'processed_at' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        try {
            return $this->ok(PayrollProcessing::create($validated), 'Payroll processing created successfully', 201);
        } catch (QueryException $e) {
            if ($this->isUniqueMonthYearError($e)) {
                return $this->fail('A payroll processing record for this month and year already exists.', 422, [
                    'month' => ['Duplicate month and year combination.'],
                    'year' => ['Duplicate month and year combination.'],
                ]);
            }

            throw $e;
        }
    }

    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'process payroll');
        return $this->ok(PayrollProcessing::findOrFail($id));
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'process payroll');
        $item = PayrollProcessing::findOrFail($id);
        $validated = $request->validate([
            'month' => 'sometimes|integer|min:1|max:12',
            'year' => 'sometimes|integer|min:2020',
            'status' => 'sometimes|in:draft,processing,completed,cancelled',
            'processed_at' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        try {
            $item->update($validated);
        } catch (QueryException $e) {
            if ($this->isUniqueMonthYearError($e)) {
                return $this->fail('A payroll processing record for this month and year already exists.', 422, [
                    'month' => ['Duplicate month and year combination.'],
                    'year' => ['Duplicate month and year combination.'],
                ]);
            }

            throw $e;
        }

        return $this->ok($item, 'Payroll processing updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'process payroll');
        PayrollProcessing::findOrFail($id)->delete();
        return $this->ok(null, 'Payroll processing deleted successfully');
    }

    private function isUniqueMonthYearError(QueryException $e): bool
    {
        return str_contains(strtolower($e->getMessage()), 'unique')
            || str_contains(strtolower($e->getMessage()), 'payroll_processings_month_year_unique');
    }
}
