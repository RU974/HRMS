<?php

namespace App\Http\Controllers;

use App\Models\Shift;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ShiftController extends Controller
{
    public function index(Request $request)
    {
        $query = Shift::query();
        $this->scopeToCompany($request, $query);
        return $this->ok($query->orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $request->user()->company_id;
        $validated = $request->validate([
            'name'          => ['required', 'string', 'max:120', Rule::unique('shifts', 'name')->where('company_id', $companyId)],
            'start_time'    => 'required|date_format:H:i',
            'end_time'      => 'required|date_format:H:i',
            'grace_minutes' => 'nullable|integer|min:0|max:180',
            'is_active'     => 'nullable|boolean',
        ]);
        $shift = Shift::create([
            ...$validated,
            'company_id'    => $companyId,
            'grace_minutes' => $validated['grace_minutes'] ?? 0,
            'is_active'     => $validated['is_active'] ?? true,
        ]);

        return $this->ok($shift, 'Shift created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $query = Shift::query();
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
            'start_time'    => 'sometimes|date_format:H:i',
            'end_time'      => 'sometimes|date_format:H:i',
            'grace_minutes' => 'sometimes|integer|min:0|max:180',
            'is_active'     => 'sometimes|boolean',
        ]);
        $shift->update($validated);

        return $this->ok($shift, 'Shift updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $query = Shift::query();
        $this->scopeToCompany($request, $query);
        $query->findOrFail($id)->delete();
        return $this->ok(null, 'Shift deleted successfully');
    }
}
