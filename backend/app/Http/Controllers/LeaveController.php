<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Leave;
use App\Models\User;
use Illuminate\Http\Request;

class LeaveController extends Controller
{
    private const MANAGER_ROLES = [
        User::ROLE_SUPER_ADMIN,
        User::ROLE_COMPANY_ADMIN,
        User::ROLE_HR_MANAGER,
        User::ROLE_HR_EXECUTIVE,
    ];

    public function index(Request $request)
    {
        $query = Leave::query()->with('employee:id,name');
        $role = $request->user()?->role;

        if (in_array($role, self::MANAGER_ROLES, true)) {
            if ($request->filled('employee_id')) {
                $query->where('employee_id', $request->employee_id);
            }
            if ($request->filled('status')) {
                $query->where('status', $request->status);
            }
        } else {
            $employee = Employee::where('user_id', $request->user()?->id)->firstOrFail();
            $query->where('employee_id', $employee->id);
        }

        return $this->ok($query->latest()->paginate((int) $request->input('per_page', 15)));
    }

    public function show(Request $request, $id)
    {
        $leave = Leave::with('employee:id,name')->findOrFail($id);
        $this->authorizeRead($request, $leave);

        return $this->ok($leave);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'type' => 'required|string|max:100',
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'status' => 'nullable|in:pending,approved,rejected,cancelled',
        ]);

        $this->authorizeCreate($request, (int) $validated['employee_id']);
        $validated['status'] = $validated['status'] ?? 'pending';

        $leave = Leave::create($validated);
        return $this->ok($leave, 'Leave request created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $leave = Leave::findOrFail($id);
        $role = $request->user()?->role;
        $isManager = in_array($role, self::MANAGER_ROLES, true);
        if (!$isManager) {
            abort(403, 'You are not authorized to update this leave request.');
        }

        $validated = $request->validate([
            'type' => 'sometimes|string|max:100',
            'from_date' => 'sometimes|date',
            'to_date' => 'sometimes|date',
            'status' => 'sometimes|in:pending,approved,rejected,cancelled',
        ]);

        if (isset($validated['from_date']) && isset($validated['to_date']) && strtotime($validated['to_date']) < strtotime($validated['from_date'])) {
            return $this->fail('The to_date must be after or equal to from_date.', 422);
        }

        $leave->update($validated);
        return $this->ok($leave, 'Leave request updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $leave = Leave::findOrFail($id);
        $role = $request->user()?->role;

        if (in_array($role, self::MANAGER_ROLES, true)) {
            $leave->delete();
            return $this->ok(null, 'Leave request deleted successfully');
        }

        $employee = Employee::where('user_id', $request->user()?->id)->firstOrFail();
        if ((int) $leave->employee_id !== (int) $employee->id || $leave->status !== 'pending') {
            abort(403, 'You can only delete your own pending leave request.');
        }

        $leave->delete();
        return $this->ok(null, 'Leave request deleted successfully');
    }

    private function authorizeRead(Request $request, Leave $leave): void
    {
        $role = $request->user()?->role;
        if (in_array($role, self::MANAGER_ROLES, true)) {
            return;
        }

        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if ($employee && (int) $employee->id === (int) $leave->employee_id) {
            return;
        }

        abort(403, 'You are not authorized to view this leave request.');
    }

    private function authorizeCreate(Request $request, int $employeeId): void
    {
        $role = $request->user()?->role;
        if (in_array($role, self::MANAGER_ROLES, true)) {
            return;
        }

        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if ($employee && (int) $employee->id === $employeeId) {
            return;
        }

        abort(403, 'You can only create leave requests for your own profile.');
    }
}
