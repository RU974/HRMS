<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class HolidayController extends Controller
{
    public function index(Request $request)
    {
        $query = Holiday::query();
        $this->scopeToCompany($request, $query);
        return $this->ok($query->orderBy('holiday_date')->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $request->user()->company_id;
        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'holiday_date' => ['required', 'date', Rule::unique('holidays', 'holiday_date')->where('company_id', $companyId)],
            'is_optional'  => 'nullable|boolean',
        ]);
        $holiday = Holiday::create([
            ...$validated,
            'company_id'  => $companyId,
            'is_optional' => $validated['is_optional'] ?? false,
        ]);

        return $this->ok($holiday, 'Holiday created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $query = Holiday::query();
        $this->scopeToCompany($request, $query);
        return $this->ok($query->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $request->user()->company_id;
        $query     = Holiday::query();
        $this->scopeToCompany($request, $query);
        $holiday   = $query->findOrFail($id);
        $validated = $request->validate([
            'name'         => 'sometimes|string|max:255',
            'holiday_date' => ['sometimes', 'date', Rule::unique('holidays', 'holiday_date')->ignore($id)->where('company_id', $companyId)],
            'is_optional'  => 'sometimes|boolean',
        ]);
        $holiday->update($validated);

        return $this->ok($holiday, 'Holiday updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $query = Holiday::query();
        $this->scopeToCompany($request, $query);
        $query->findOrFail($id)->delete();
        return $this->ok(null, 'Holiday deleted successfully');
    }
}
