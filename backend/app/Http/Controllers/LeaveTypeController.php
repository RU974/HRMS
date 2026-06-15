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
        $this->authorizePermission($request, 'attendance:edit|leaves:manage_settings');
        $validated = $request->validate([
            'name' => 'required|string|max:120|unique:leave_types,name',
            'default_days' => 'nullable|integer|min:0|max:365',
            'is_paid' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
            'accrual_frequency' => 'nullable|in:none,monthly,yearly',
            'accrual_amount' => 'nullable|integer|min:0|max:365',
            'carry_forward_days' => 'nullable|integer|min:0|max:365',
            'max_balance' => 'nullable|integer|min:0|max:365',
            'required_approval_levels' => 'nullable|integer|min:1|max:5',
            'min_request_days'    => 'nullable|integer|min:0|max:365',
            'max_request_days'    => 'nullable|integer|min:0|max:365',
            'notice_period_days'  => 'nullable|integer|min:0|max:365',
            'allow_half_day'      => 'nullable|boolean',
            'encashable'          => 'nullable|boolean',
        ]);

        $leaveType = LeaveType::create([
            'name'                     => $validated['name'],
            'default_days'             => $validated['default_days'] ?? 0,
            'is_paid'                  => $validated['is_paid'] ?? true,
            'is_active'                => $validated['is_active'] ?? true,
            'accrual_frequency'        => $validated['accrual_frequency'] ?? 'yearly',
            'accrual_amount'           => $validated['accrual_amount'] ?? 0,
            'carry_forward_days'       => $validated['carry_forward_days'] ?? 0,
            'max_balance'              => $validated['max_balance'] ?? 0,
            'required_approval_levels' => $validated['required_approval_levels'] ?? 1,
            'min_request_days'         => $validated['min_request_days'] ?? 1,
            'max_request_days'         => $validated['max_request_days'] ?? 0,
            'notice_period_days'       => $validated['notice_period_days'] ?? 0,
            'allow_half_day'           => $validated['allow_half_day'] ?? false,
            'encashable'               => $validated['encashable'] ?? false,
        ]);

        return $this->ok($leaveType, 'Leave type created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(LeaveType::findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit|leaves:manage_settings');
        $leaveType = LeaveType::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:120|unique:leave_types,name,' . $id,
            'default_days' => 'sometimes|integer|min:0|max:365',
            'is_paid' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
            'accrual_frequency' => 'sometimes|in:none,monthly,yearly',
            'accrual_amount' => 'sometimes|integer|min:0|max:365',
            'carry_forward_days' => 'sometimes|integer|min:0|max:365',
            'max_balance' => 'sometimes|integer|min:0|max:365',
            'required_approval_levels' => 'sometimes|integer|min:1|max:5',
            'min_request_days'   => 'sometimes|integer|min:0|max:365',
            'max_request_days'   => 'sometimes|integer|min:0|max:365',
            'notice_period_days' => 'sometimes|integer|min:0|max:365',
            'allow_half_day'     => 'sometimes|boolean',
            'encashable'         => 'sometimes|boolean',
        ]);
        $leaveType->update($validated);

        return $this->ok($leaveType, 'Leave type updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit|leaves:manage_settings');
        LeaveType::findOrFail($id)->delete();
        return $this->ok(null, 'Leave type deleted successfully');
    }
}
