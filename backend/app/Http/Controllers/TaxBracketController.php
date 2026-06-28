<?php

namespace App\Http\Controllers;

use App\Models\TaxBracket;
use Illuminate\Http\Request;

class TaxBracketController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:view|payroll:manage_settings');

        $query = TaxBracket::orderBy('min_income');
        $this->scopeToCompanyOrGlobal($request, $query);

        return $this->ok($query->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $validated = $request->validate([
            'name'       => 'required|string|max:120',
            'min_income' => 'required|numeric|min:0',
            'max_income' => 'nullable|numeric|gt:min_income',
            'rate'       => 'required|numeric|min:0|max:100',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $bracket = TaxBracket::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
        ]);

        return $this->ok($bracket, 'Tax bracket created.', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $bracket = TaxBracket::findOrFail($id);
        $this->assertOwnsRecord($request, $bracket);

        $validated = $request->validate([
            'name'       => 'sometimes|string|max:120',
            'min_income' => 'sometimes|numeric|min:0',
            'max_income' => 'nullable|numeric',
            'rate'       => 'sometimes|numeric|min:0|max:100',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $bracket->update($validated);
        return $this->ok($bracket, 'Tax bracket updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $bracket = TaxBracket::findOrFail($id);
        $this->assertOwnsRecord($request, $bracket);
        $bracket->delete();
        return $this->ok(null, 'Tax bracket deleted.');
    }

    private function assertOwnsRecord(Request $request, TaxBracket $bracket): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId && $bracket->company_id && $bracket->company_id !== $companyId) {
            abort(403, 'You cannot modify this tax bracket.');
        }
    }
}
