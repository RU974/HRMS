<?php

namespace App\Http\Controllers;

use App\Models\LeaveType;
use Illuminate\Http\Request;

class LeaveTypeController extends Controller
{
    public function index()
    {
        return $this->ok(LeaveType::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120|unique:leave_types,name',
            'default_days' => 'nullable|integer|min:0|max:365',
            'is_paid' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
        ]);

        $leaveType = LeaveType::create([
            'name' => $validated['name'],
            'default_days' => $validated['default_days'] ?? 0,
            'is_paid' => $validated['is_paid'] ?? true,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return $this->ok($leaveType, 'Leave type created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(LeaveType::findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $leaveType = LeaveType::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:120|unique:leave_types,name,' . $id,
            'default_days' => 'sometimes|integer|min:0|max:365',
            'is_paid' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
        ]);
        $leaveType->update($validated);

        return $this->ok($leaveType, 'Leave type updated successfully');
    }

    public function destroy($id)
    {
        LeaveType::findOrFail($id)->delete();
        return $this->ok(null, 'Leave type deleted successfully');
    }
}
