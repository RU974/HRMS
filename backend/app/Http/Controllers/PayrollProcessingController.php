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

        $query = PayrollProcessing::query()
            ->forCompany($this->companyId($request))
            ->latest();

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

        // Stamp with the authenticated user's company
        $validated['company_id'] = $this->companyId($request);

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

        $item = PayrollProcessing::findOrFail($id);
        $this->assertSameCompany($request, $item);

        return $this->ok($item);
    }

    // ──────────────────────────────────────────────────────────────
    //  PUT /api/payroll-processings/{id}
    // ──────────────────────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $item = PayrollProcessing::findOrFail($id);
        $this->assertSameCompany($request, $item);

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

        $item = PayrollProcessing::findOrFail($id);
        $this->assertSameCompany($request, $item);

        $item->delete();

        return $this->ok(null, 'Payroll processing deleted successfully.');
    }

    // ──────────────────────────────────────────────────────────────
    //  Private helpers
    // ──────────────────────────────────────────────────────────────

    /**
     * Returns the authenticated user's company_id, or null for super-admins
     * who have no company assignment (they can see everything).
     */
    private function companyId(Request $request): ?string
    {
        return $request->user()?->company_id
            ? (string) $request->user()->company_id
            : null;
    }

    /**
     * Abort 403 if the record belongs to a different company than the requester.
     * Super-admins (no company_id) are always allowed through.
     */
    private function assertSameCompany(Request $request, PayrollProcessing $item): void
    {
        $companyId = $this->companyId($request);

        if ($companyId === null) {
            return; // super-admin — unrestricted
        }

        if ((string) ($item->company_id ?? '') !== $companyId) {
            abort(403, 'You are not authorized to access this payroll processing record.');
        }
    }

    private function isUniqueError(QueryException $e): bool
    {
        $msg = strtolower($e->getMessage());
        return str_contains($msg, 'unique') || str_contains($msg, 'duplicate');
    }
}