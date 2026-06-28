<?php

namespace App\Http\Controllers;

use App\Models\PayrollProcessing;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class PayrollProcessingController extends Controller
{
    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll-processings
    // ──────────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $query = PayrollProcessing::query()->latest();
        $this->scopeToCompany($request, $query);

        if ($request->filled('month')) {
            $query->where('month', (int) $request->query('month'));
        }
        if ($request->filled('year')) {
            $query->where('year', (int) $request->query('year'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return $this->ok($query->paginate(15));
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/payroll-processings
    // ──────────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $validated = $request->validate([
            'month'        => 'required|integer|min:1|max:12',
            'year'         => 'required|integer|min:2020',
            'status'       => 'required|in:draft,processing,completed,cancelled',
            'processed_at' => 'nullable|date',
            'notes'        => 'nullable|string|max:1000',
        ]);

        $validated['company_id'] = $request->user()?->company_id;

        try {
            $item = PayrollProcessing::create($validated);
        } catch (QueryException $e) {
            if ($this->isUniqueError($e)) {
                return $this->fail(
                    'A payroll processing record for this company, month, and year already exists.',
                    422,
                    [
                        'month' => ['Duplicate month/year combination for this company.'],
                        'year'  => ['Duplicate month/year combination for this company.'],
                    ]
                );
            }
            throw $e;
        }

        return $this->ok($item, 'Payroll processing created successfully.', 201);
    }

    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll-processings/{id}
    // ──────────────────────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $query = PayrollProcessing::query();
        $this->scopeToCompany($request, $query);
        $item  = $query->findOrFail($id);

        return $this->ok($item);
    }

    // ──────────────────────────────────────────────────────────────
    //  PUT /api/payroll-processings/{id}
    // ──────────────────────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $query = PayrollProcessing::query();
        $this->scopeToCompany($request, $query);
        $item  = $query->findOrFail($id);

        $validated = $request->validate([
            'month'        => 'sometimes|integer|min:1|max:12',
            'year'         => 'sometimes|integer|min:2020',
            'status'       => 'sometimes|in:draft,processing,completed,cancelled',
            'processed_at' => 'nullable|date',
            'notes'        => 'nullable|string|max:1000',
        ]);

        try {
            $item->update($validated);
        } catch (QueryException $e) {
            if ($this->isUniqueError($e)) {
                return $this->fail(
                    'A payroll processing record for this company, month, and year already exists.',
                    422,
                    [
                        'month' => ['Duplicate month/year combination for this company.'],
                        'year'  => ['Duplicate month/year combination for this company.'],
                    ]
                );
            }
            throw $e;
        }

        return $this->ok($item, 'Payroll processing updated successfully.');
    }

    // ──────────────────────────────────────────────────────────────
    //  DELETE /api/payroll-processings/{id}
    // ──────────────────────────────────────────────────────────────
    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $query = PayrollProcessing::query();
        $this->scopeToCompany($request, $query);
        $item  = $query->findOrFail($id);

        $item->delete();

        return $this->ok(null, 'Payroll processing deleted successfully.');
    }

    // ──────────────────────────────────────────────────────────────
    //  Private helpers
    // ──────────────────────────────────────────────────────────────

    private function isUniqueError(QueryException $e): bool
    {
        $msg = strtolower($e->getMessage());
        return str_contains($msg, 'unique') || str_contains($msg, 'duplicate');
    }
}