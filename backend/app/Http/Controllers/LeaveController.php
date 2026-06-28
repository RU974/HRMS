<?php

namespace App\Http\Controllers;

use App\Events\LeaveRequested;
use App\Events\LeaveStatusChanged;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\LeaveType;
use App\Models\User;
use App\Services\LeavePolicyService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LeaveController extends Controller
{
    public function index(Request $request)
    {
        $query = Leave::query()->with('employee:id,name');
        $user = $request->user();
        $this->scopeToCompany($request, $query, 'employee.user');
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        if ($user?->can('leaves:view') || $user?->can('leaves:approve')) {
            if ($request->filled('employee_id')) {
                $this->assertEmployeeInCompany($request, (int) $request->employee_id);
                $query->where('employee_id', $request->employee_id);
            }
            if ($request->filled('status')) {
                $query->where('status', $request->status);
            }
            if ($request->filled('from_date')) {
                $query->where('to_date', '>=', $request->from_date);
            }
            if ($request->filled('to_date')) {
                $query->where('from_date', '<=', $request->to_date);
            }
        } else {
            // Regular employees: scope to own records only
            $employee = Employee::where('user_id', $user?->id)->first();
            if (!$employee) {
                return $this->ok(['data' => [], 'total' => 0]);
            }
            $query->where('employee_id', $employee->id);
        }

        return $this->ok($query->latest()->paginate((int) $request->input('per_page', 15)));
    }

    public function show(Request $request, $id)
    {
        $leave = Leave::with('employee:id,name')->findOrFail($id);
        $this->authorizeRead($request, $leave);
        $this->assertEmployeeInCompany($request, (int) $leave->employee_id);

        return $this->ok($leave);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'type'        => 'required|string|max:100',
            'from_date'   => 'required|date',
            'to_date'     => 'required|date|after_or_equal:from_date',
            'half_day'    => 'nullable|boolean',
            'reason'      => 'nullable|string|max:1000',
            'status'      => 'nullable|in:pending,approved,rejected,cancelled',
        ]);

        $this->authorizeCreate($request, (int) $validated['employee_id']);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        // Non-approvers (regular employees) cannot set an arbitrary status.
        // Force every employee-created request to 'pending' regardless of what was submitted.
        if (!$request->user()?->can('leaves:approve')) {
            $validated['status'] = 'pending';
        } else {
            $validated['status'] = $validated['status'] ?? 'pending';
        }

        try {
            $leave = DB::transaction(function () use ($validated, $request) {
                $leave = Leave::create(array_merge($validated, ['approval_step' => 1]));
                $policyService = new LeavePolicyService();
                $leaveType = $policyService->findLeaveTypeByName($leave->type);
                $isApproverCreatedApproved = $request->user()?->can('leaves:approve') && $leave->status === 'approved';
                if ($isApproverCreatedApproved && $leaveType && (int) $leaveType->required_approval_levels > 1) {
                    $leave->status = 'pending';
                    $leave->save();
                }

                $policyService->reservePendingLeave($leave, $isApproverCreatedApproved);

                if ($leave->status === 'approved') {
                    $policyService->finalizeLeaveApproval($leave);
                }

                return $leave;
            });
        } catch (\RuntimeException $exception) {
            return $this->fail($exception->getMessage(), 422);
        }

        // Notify the department manager and HR that a new leave request needs attention.
        // Only dispatched for pending requests — if an approver created an already-approved
        // leave there is nothing to action.
        if ($leave->status === 'pending') {
            LeaveRequested::dispatch($leave);
        }

        return $this->ok($leave, 'Leave request created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $leave = Leave::findOrFail($id);
        if (!$request->user()?->can('leaves:approve')) {
            abort(403, 'You are not authorized to update this leave request.');
        }
        $this->assertEmployeeInCompany($request, (int) $leave->employee_id);

        $originalStatus = $leave->status;
        $originalType = $leave->type;
        $originalFromDate = $leave->from_date;
        $originalToDate = $leave->to_date;

        $validated = $request->validate([
            'type'      => 'sometimes|string|max:100',
            'from_date' => 'sometimes|date',
            'to_date'   => 'sometimes|date',
            'half_day'  => 'sometimes|boolean',
            'reason'    => 'nullable|string|max:1000',
            'status'    => 'sometimes|in:pending,approved,rejected,cancelled',
        ]);

        if (isset($validated['from_date']) && isset($validated['to_date']) && strtotime($validated['to_date']) < strtotime($validated['from_date'])) {
            return $this->fail('The to_date must be after or equal to from_date.', 422);
        }

        $leave->fill($validated);
        $policyService = new LeavePolicyService();

        try {
            DB::transaction(function () use ($leave, $validated, $originalStatus, $originalType, $originalFromDate, $originalToDate, $policyService) {
                $pendingReservationUpdated = false;
                $leave->save();

                if ($originalStatus === 'pending' && $leave->status === 'pending' && (
                    array_key_exists('type', $validated)
                    || array_key_exists('from_date', $validated)
                    || array_key_exists('to_date', $validated)
                )) {
                    $originalSegments = $policyService->segmentsForRange($leave->employee, $originalType, $originalFromDate, $originalToDate);
                    $policyService->adjustPendingReservation($leave, $originalSegments);
                    $pendingReservationUpdated = true;
                }

                if ($originalStatus !== $leave->status) {
                    if ($leave->status === 'approved') {
                        $policyService->finalizeLeaveApproval($leave);
                    } elseif (in_array($leave->status, ['rejected', 'cancelled'], true)) {
                        $policyService->releaseLeaveReservation($leave, $originalStatus);
                    }
                }
            });
        } catch (\RuntimeException $exception) {
            return $this->fail($exception->getMessage(), 422);
        }

        $refreshed = $leave->refresh();

        // Notify the employee if their leave status changed to a terminal state.
        if ($refreshed->status !== $originalStatus) {
            LeaveStatusChanged::dispatch($refreshed, $originalStatus);
        }

        return $this->ok($refreshed, 'Leave request updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $leave = Leave::findOrFail($id);

        if ($request->user()?->can('leaves:approve')) {
            $this->assertEmployeeInCompany($request, (int) $leave->employee_id);
            $this->authorizeManagedEmployeeAccess($request, (int) $leave->employee_id, 'leave request');

            $policyService = new LeavePolicyService();
            DB::transaction(function () use ($leave, $policyService) {
                $policyService->releaseLeaveReservation($leave, $leave->status);
                $leave->delete();
            });

            return $this->ok(null, 'Leave request deleted successfully');
        }

        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if (!$employee || (int) $leave->employee_id !== (int) $employee->id || $leave->status !== 'pending') {
            abort(403, 'You can only delete your own pending leave request.');
        }

        $policyService = new LeavePolicyService();
        DB::transaction(function () use ($leave, $policyService) {
            $policyService->releaseLeaveReservation($leave, $leave->status);
            $leave->delete();
        });

        return $this->ok(null, 'Leave request deleted successfully');
    }

    public function teamCalendar(Request $request)
    {
        $this->authorizePermission($request, 'leaves:approve');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year'  => 'required|integer|min:2000',
        ]);

        $firstDay = Carbon::create((int) $validated['year'], (int) $validated['month'], 1)->startOfMonth();
        $lastDay  = $firstDay->copy()->endOfMonth();

        $query = Leave::with('employee:id,name,department_id')
            ->whereIn('status', ['approved', 'pending'])
            ->where('from_date', '<=', $lastDay->toDateString())
            ->where('to_date', '>=', $firstDay->toDateString());

        $this->scopeToCompany($request, $query, 'employee.user');
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        return $this->ok($query->get());
    }

    public function balanceSummary(Request $request)
    {
        $employeeId = (int) $request->input('employee_id');
        if (!$employeeId) {
            $self = Employee::where('user_id', $request->user()?->id)->first();
            if (!$self) return $this->ok([]);
            $employeeId = $self->id;
        } else {
            $this->assertEmployeeInCompany($request, $employeeId);
        }

        $employee     = Employee::findOrFail($employeeId);
        $companyId    = $request->user()?->company_id ?? $employee->company_id;
        $leaveTypes   = LeaveType::where('is_active', true)->where('company_id', $companyId)->orderBy('name')->get();
        $policyService = new LeavePolicyService();
        $today        = Carbon::today();

        $balances = $leaveTypes->map(function (LeaveType $type) use ($employee, $policyService, $today) {
            $balance = $policyService->buildBalanceSummary($employee, $type, $today);
            return [
                'leave_type'          => ['id' => $type->id, 'name' => $type->name, 'is_paid' => $type->is_paid, 'encashable' => $type->encashable],
                'accrued_days'        => $balance->accrued_days,
                'used_days'           => $balance->used_days,
                'pending_days'        => $balance->pending_days,
                'carried_forward_days'=> $balance->carried_forward_days,
                'remaining_days'      => $balance->remaining_days,
            ];
        });

        return $this->ok($balances);
    }

    public function encashment(Request $request)
    {
        $employeeId = (int) $request->input('employee_id');
        if (!$employeeId) {
            $self = Employee::where('user_id', $request->user()?->id)->first();
            if (!$self) return $this->ok(['items' => [], 'total_encashment' => 0]);
            $employeeId = $self->id;
        } else {
            $this->assertEmployeeInCompany($request, $employeeId);
        }

        $employee      = Employee::findOrFail($employeeId);
        $companyId     = $request->user()?->company_id ?? $employee->company_id;
        $leaveTypes    = LeaveType::where('is_active', true)->where('encashable', true)->where('company_id', $companyId)->orderBy('name')->get();
        $policyService = new LeavePolicyService();
        $today         = Carbon::today();
        $dailyRate     = $employee->basic_salary ? round((float) $employee->basic_salary / 26, 2) : 0;

        $items = $leaveTypes->map(function (LeaveType $type) use ($employee, $policyService, $today, $dailyRate) {
            $balance = $policyService->buildBalanceSummary($employee, $type, $today);
            return [
                'leave_type'        => $type->name,
                'remaining_days'    => $balance->remaining_days,
                'daily_rate'        => $dailyRate,
                'encashment_amount' => round($balance->remaining_days * $dailyRate, 2),
            ];
        });

        return $this->ok([
            'employee'         => ['id' => $employee->id, 'name' => $employee->name],
            'daily_rate'       => $dailyRate,
            'items'            => $items,
            'total_encashment' => $items->sum('encashment_amount'),
        ]);
    }

    private function authorizeRead(Request $request, Leave $leave): void
    {
        if ($request->user()?->can('leaves:view') || $request->user()?->can('leaves:approve')) {
            $this->assertEmployeeInCompany($request, (int) $leave->employee_id);
            $this->authorizeManagedEmployeeAccess($request, (int) $leave->employee_id, 'leave request');
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
        if ($request->user()?->can('leaves:manage_settings') || $request->user()?->can('leaves:approve')) {
            $this->assertEmployeeInCompany($request, $employeeId);
            $this->authorizeManagedEmployeeAccess($request, $employeeId, 'leave request');
            return;
        }

        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if ($request->user()?->can('leaves:create') && $employee && (int) $employee->id === $employeeId) {
            return;
        }

        abort(403, 'You can only create leave requests for your own profile.');
    }

}