<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Employee;
use App\Models\Shift;
use App\Models\User;
use App\Services\AttendanceCalculator;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Attendance::with('employee');
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        if ($request->has('employee_id')) {
            $employeeId = (int) $request->employee_id;
            if (!$user?->can('attendance:manage_settings')) {
                $this->authorizeAttendanceAccess($request, $employeeId);
            }
            $this->assertEmployeeInCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        } elseif ($user?->can('attendance:manage_settings') || $user?->can('attendance:approve')) {
            // Only managers/admins can see all company records
        } else {
            // Regular employees: scope to own records only
            $employee = Employee::where('user_id', $request->user()?->id)->first();
            if (!$employee) {
                return $this->ok(['data' => [], 'total' => 0]);
            }
            $query->where('employee_id', $employee->id);
        }

        if ($request->has('date')) {
            $query->whereDate('date', $request->date);
        }
        if ($request->has('month')) {
            $query->whereMonth('date', $request->month);
        }
        if ($request->has('year')) {
            $query->whereYear('date', $request->year);
        }
        return $this->ok($query->paginate(15));
    }

    public function show($id)
    {
        $attendance = Attendance::with('employee')->findOrFail($id);
        $this->authorizeAttendanceAccess(request(), (int) $attendance->employee_id);
        $this->assertEmployeeInCompany(request(), (int) $attendance->employee_id);
        return $this->ok($attendance);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $validated = $request->validate([
            'employee_id'    => 'required|exists:employees,id',
            'date'           => 'required|date',
            'check_in'       => 'nullable|date_format:H:i',
            'check_out'      => 'nullable|date_format:H:i',
            'status'         => 'nullable|in:present,absent,leave,late',
            'work_from_home' => 'nullable|boolean',
            'notes'          => 'nullable|string',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $alreadyExists = Attendance::where('employee_id', $validated['employee_id'])
            ->whereDate('date', $validated['date'])
            ->exists();
        if ($alreadyExists) {
            return $this->fail('Attendance already exists for this employee on this date.', 422);
        }

        $policy = AttendancePolicy::query()->first();
        $shift = $this->getEmployeeShift((int) $validated['employee_id']);
        $status = $validated['status'] ?? 'present';

        if (!empty($validated['check_in'])) {
            $validated['check_in'] = $this->attendanceCalculator()->normalizeCheckTime($validated['date'], $validated['check_in']);
            $status = $this->attendanceCalculator()->deriveStatusFromCheckIn(
                $policy,
                $shift,
                $validated['check_in'],
                $status
            );
        }

        if (!empty($validated['check_out'])) {
            $validated['check_out'] = $this->attendanceCalculator()->normalizeCheckTime($validated['date'], $validated['check_out']);
        }

        $validated['status'] = $status;

        $attendance = Attendance::create($validated);
        return $this->ok($attendance, 'Attendance recorded successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:approve');
        $attendance = Attendance::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);
        $validated = $request->validate([
            'date'           => 'sometimes|date',
            'check_in'       => 'nullable|date_format:H:i',
            'check_out'      => 'nullable|date_format:H:i',
            'status'         => 'sometimes|in:present,absent,leave,late',
            'work_from_home' => 'nullable|boolean',
            'notes'          => 'nullable|string',
        ]);

        $date = Carbon::parse($validated['date'] ?? $attendance->date)->toDateString();
        if (!empty($validated['check_in'])) {
            $validated['check_in'] = $this->attendanceCalculator()->normalizeCheckTime($date, $validated['check_in']);
        }
        if (!empty($validated['check_out'])) {
            $validated['check_out'] = $this->attendanceCalculator()->normalizeCheckTime($date, $validated['check_out']);
        }

        $policy = AttendancePolicy::query()->first();
        $shift = $attendance->employee?->shift;
        if (!empty($validated['check_in'])) {
            $currentStatus = $validated['status'] ?? $attendance->status;
            $validated['status'] = $this->attendanceCalculator()->deriveStatusFromCheckIn(
                $policy,
                $shift,
                $validated['check_in'],
                $currentStatus
            );
        }

        if (!empty($validated['check_in']) && !empty($validated['check_out'])) {
            if (Carbon::parse($validated['check_out'])->lessThan(Carbon::parse($validated['check_in']))) {
                return $this->fail('Check-out cannot be earlier than check-in.', 422);
            }
        }

        $attendance->update($validated);
        return $this->ok($attendance, 'Attendance updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $attendance = Attendance::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);
        $attendance->delete();
        return $this->ok(null, 'Attendance deleted successfully');
    }

    public function getByEmployee($employeeId, Request $request)
    {
        $this->authorizeAttendanceAccess($request, (int) $employeeId);
        $this->assertEmployeeInCompany($request, (int) $employeeId);

        $query = Attendance::where('employee_id', $employeeId);
        $this->applyManagedEmployeeScope($request, $query, 'employee');
        if ($request->has('month')) {
            $query->whereMonth('date', $request->month);
        }
        if ($request->has('year')) {
            $query->whereYear('date', $request->year);
        }
        return $this->ok($query->orderBy('date', 'desc')->paginate(31));
    }

    public function getMonthlyStats($employeeId, $month, $year)
    {
        $this->authorizeAttendanceAccess(request(), (int) $employeeId);
        $this->assertEmployeeInCompany(request(), (int) $employeeId);

        $stats = Attendance::where('employee_id', $employeeId)
            ->whereMonth('date', $month)
            ->whereYear('date', $year)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok([
            'total_days' => $stats->sum('count'),
            'present' => $stats->where('status', 'present')->sum('count'),
            'absent' => $stats->where('status', 'absent')->sum('count'),
            'leave' => $stats->where('status', 'leave')->sum('count'),
            'late' => $stats->where('status', 'late')->sum('count'),
        ]);
    }

    public function checkIn(Request $request)
    {
        $validated = $request->validate(['employee_id' => 'required|exists:employees,id']);
        $this->authorizeAttendanceAccess($request, (int) $validated['employee_id']);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $today = Carbon::today();
        $attendance = Attendance::where('employee_id', $validated['employee_id'])->whereDate('date', $today)->first();
        $policy = AttendancePolicy::query()->first();
        $shift = Employee::find($validated['employee_id'])?->shift;
        $now = Carbon::now();

        if (!$attendance) {
            $checkIn = $now->toDateTimeString();
            $attendance = Attendance::create([
                'employee_id' => $validated['employee_id'],
                'date' => $today,
                'check_in' => $checkIn,
                'status' => $this->attendanceCalculator()->deriveStatusFromCheckIn(
                    $policy,
                    $shift,
                    $checkIn,
                    'present'
                ),
            ]);

            return $this->ok($attendance, 'Check-in successful');
        }

        if ($attendance->check_in && !$attendance->check_out) {
            return $this->ok($attendance, 'Already checked in for today');
        }

        if ($attendance->check_in && $attendance->check_out) {
            return $this->fail('Attendance already completed for today.', 422);
        }

        $attendance->update([
            'check_in' => $now->toDateTimeString(),
            'status' => $this->attendanceCalculator()->deriveStatusFromCheckIn(
                $policy,
                $shift,
                $now->toDateTimeString(),
                $attendance->status ?? 'present'
            ),
        ]);

        return $this->ok($attendance, 'Check-in successful');
    }

    public function checkOut(Request $request)
    {
        $validated = $request->validate(['employee_id' => 'required|exists:employees,id']);
        $this->authorizeAttendanceAccess($request, (int) $validated['employee_id']);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $attendance = Attendance::where('employee_id', $validated['employee_id'])->whereDate('date', Carbon::today())->first();
        if (!$attendance) {
            return $this->fail('No check-in record found for today.', 404);
        }

        if ($attendance->check_out) {
            return $this->ok($attendance, 'Already checked out for today');
        }

        $update = ['check_out' => Carbon::now()->toDateTimeString()];
        if (!$attendance->check_in) {
            $update['notes'] = trim((string) ($attendance->notes ? $attendance->notes . ' ' : '') . 'Recorded check-out without prior check-in.');
        }

        $attendance->update($update);
        return $this->ok($attendance, 'Check-out successful');
    }

    public function listCorrections(Request $request)
    {
        $user = $request->user();
        $query = Attendance::with('employee')->whereNotNull('correction_status');

        if ($request->has('employee_id')) {
            $employeeId = (int) $request->employee_id;
            if (!$user?->can('attendance:manage_settings') && !$user?->can('attendance:approve')) {
                $this->authorizeAttendanceAccess($request, $employeeId);
            }
            $this->assertEmployeeInCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        } elseif ($user?->can('attendance:manage_settings') || $user?->can('attendance:approve')) {
            // Only managers/admins can see all company corrections
        } else {
            $employee = Employee::where('user_id', $user?->id)->first();
            if (!$employee) {
                return $this->ok(['data' => [], 'total' => 0]);
            }
            $query->where('employee_id', $employee->id);
        }

        if ($request->has('status')) {
            $query->where('correction_status', $request->status);
        }

        if ($request->has('month')) {
            $query->whereMonth('date', $request->month);
        }
        if ($request->has('year')) {
            $query->whereYear('date', $request->year);
        }

        if ($user?->can('attendance:manage_settings') || $user?->can('attendance:approve')) {
            $this->applyManagedEmployeeScope($request, $query, 'employee');
        }

        return $this->ok($query->orderBy('correction_requested_at', 'desc')->paginate(15));
    }

    public function companyMonthlySummary(Request $request)
    {
        $this->authorizePermission($request, 'attendance:view');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $rows = Attendance::whereMonth('date', $validated['month'])
            ->whereYear('date', $validated['year'])
            ->when($request->user()?->company_id, function ($query) use ($request): void {
                $query->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            });

        $this->applyManagedEmployeeScope($request, $rows, 'employee');

        $rows = $rows
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok([
            'month' => (int) $validated['month'],
            'year' => (int) $validated['year'],
            'total' => (int) $rows->sum('count'),
            'present' => (int) $rows->where('status', 'present')->sum('count'),
            'absent' => (int) $rows->where('status', 'absent')->sum('count'),
            'leave' => (int) $rows->where('status', 'leave')->sum('count'),
            'late' => (int) $rows->where('status', 'late')->sum('count'),
        ]);
    }

    public function teamDailyView(Request $request)
    {
        $this->authorizePermission($request, 'attendance:approve');
        ['date' => $date] = $request->validate(['date' => 'required|date']);

        $user = $request->user();
        $companyId = $user?->company_id;
        $date = Carbon::parse($date)->toDateString();

        $employeeQuery = Employee::with(['department'])
            ->where('status', 'active');

        if ($companyId) {
            $employeeQuery->whereHas('user', fn ($q) => $q->where('company_id', $companyId));
        }

        // Department managers: scope to their own department
        if (!$user?->can('attendance:manage_settings') && $user?->can('attendance:approve')) {
            $mgr = Employee::where('user_id', $user->id)->first();
            if ($mgr?->department_id) {
                $employeeQuery->where('department_id', $mgr->department_id);
            }
        }

        $employees = $employeeQuery->orderBy('name')->get();
        $ids = $employees->pluck('id');

        $attendances = Attendance::whereDate('date', $date)
            ->whereIn('employee_id', $ids)
            ->get()->keyBy('employee_id');

        $month = Carbon::parse($date)->month;
        $year  = Carbon::parse($date)->year;
        $monthlyAbsences = Attendance::whereMonth('date', $month)
            ->whereYear('date', $year)
            ->whereIn('employee_id', $ids)
            ->where('status', 'absent')
            ->selectRaw('employee_id, COUNT(*) as count')
            ->groupBy('employee_id')
            ->pluck('count', 'employee_id');

        $result = $employees->map(fn ($emp) => [
            'employee_id'      => $emp->id,
            'name'             => $emp->name,
            'department'       => $emp->department?->name,
            'designation'      => $emp->designation,
            'attendance'       => $attendances->get($emp->id),
            'monthly_absences' => (int) ($monthlyAbsences->get($emp->id) ?? 0),
        ]);

        return $this->ok($result);
    }

    public function getPolicy(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        return $this->ok(AttendancePolicy::query()->first());
    }

    public function updatePolicy(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $validated = $request->validate([
            'late_after_time' => 'required|date_format:H:i',
            'allow_manual_status_override' => 'required|boolean',
        ]);

        $policy = AttendancePolicy::query()->firstOrCreate(['name' => 'Default']);
        $policy->update([
            'late_after_time' => $validated['late_after_time'] . ':00',
            'allow_manual_status_override' => $validated['allow_manual_status_override'],
        ]);

        return $this->ok($policy, 'Attendance policy updated successfully');
    }

    public function requestCorrection(Request $request, $id)
    {
        $attendance = Attendance::findOrFail($id);
        $this->authorizeAttendanceAccess($request, (int) $attendance->employee_id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);

        $validated = $request->validate([
            'correction_request_notes' => 'required|string',
        ]);

        if ($attendance->correction_status === 'pending') {
            return $this->fail('A correction request is already pending for this attendance.', 422);
        }

        $attendance->update([
            'correction_status' => 'pending',
            'correction_request_notes' => $validated['correction_request_notes'],
            'correction_requested_at' => Carbon::now(),
            'correction_response_notes' => null,
            'correction_reviewed_at' => null,
        ]);

        return $this->ok($attendance, 'Correction request submitted successfully');
    }

    public function reviewCorrection(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:approve');

        $attendance = Attendance::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);

        $validated = $request->validate([
            'correction_status' => 'required|in:pending,approved,rejected',
            'correction_response_notes' => 'nullable|string',
        ]);

        if ($attendance->correction_status !== 'pending' && $validated['correction_status'] === 'pending') {
            return $this->fail('Only pending correction requests can be reopened.', 422);
        }

        $attendance->update([
            'correction_status' => $validated['correction_status'],
            'correction_response_notes' => $validated['correction_response_notes'] ?? $attendance->correction_response_notes,
            'correction_reviewed_at' => Carbon::now(),
        ]);

        return $this->ok($attendance, 'Correction request reviewed successfully');
    }

    private function deriveStatusFromCheckIn(string $checkInDateTime, ?AttendancePolicy $policy, ?Shift $shift, string $fallbackStatus): string
    {
        return $this->attendanceCalculator()->deriveStatusFromCheckIn($policy, $shift, $checkInDateTime, $fallbackStatus);
    }

    private function attendanceCalculator(): AttendanceCalculator
    {
        return new AttendanceCalculator();
    }

    private function getEmployeeShift(int $employeeId)
    {
        return Employee::find($employeeId)?->shift;
    }

    private function authorizeAttendanceAccess(Request $request, int $employeeId): void
    {
        // Full managers can access any employee record within their scope
        if ($request->user()?->can('attendance:manage_settings')
            || $request->user()?->can('attendance:approve')) {
            $this->assertEmployeeInCompany($request, $employeeId);
            if ($request->user()?->can('attendance:manage_settings')) {
                $this->authorizeManagedEmployeeAccess($request, $employeeId, 'attendance record');
            }
            return;
        }

        // Regular employees can only access their own records
        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if (!$employee || (int)$employee->id !== $employeeId) {
            abort(403, 'You are not authorized to perform this action for this employee.');
        }
    }

    private function scopeToCompany(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }

    private function assertEmployeeInCompany(Request $request, int $employeeId): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        $allowed = Employee::query()
            ->whereKey($employeeId)
            ->whereHas('user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            })
            ->exists();

        if (!$allowed) {
            abort(403, 'You are not authorized to perform this action for this employee.');
        }
    }
}