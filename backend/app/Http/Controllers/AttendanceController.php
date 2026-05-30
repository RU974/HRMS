<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Employee;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Attendance::with('employee');

        if ($request->has('employee_id')) {
            $employeeId = (int) $request->employee_id;
            if (!$user?->can('manage attendance')) {
                $this->authorizeAttendanceAccess($request, $employeeId);
            }
            $query->where('employee_id', $employeeId);
        } elseif (!$user?->can('manage attendance')) {
            $employee = Employee::where('user_id', $request->user()?->id)->firstOrFail();
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
        return $this->ok($attendance);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage attendance');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'date' => 'required|date',
            'check_in' => 'nullable|date_format:H:i',
            'check_out' => 'nullable|date_format:H:i',
            'status' => 'nullable|in:present,absent,leave,late',
            'notes' => 'nullable|string',
        ]);

        $alreadyExists = Attendance::where('employee_id', $validated['employee_id'])
            ->whereDate('date', $validated['date'])
            ->exists();
        if ($alreadyExists) {
            return $this->fail('Attendance already exists for this employee on this date.', 422);
        }

        $policy = AttendancePolicy::query()->first();
        $status = $validated['status'] ?? 'present';
        if (!empty($validated['check_in'])) {
            $validated['check_in'] = Carbon::parse($validated['date'] . ' ' . $validated['check_in'])->toDateTimeString();
            $status = $this->deriveStatusFromCheckIn($validated['check_in'], $policy, $status);
        }
        if (!empty($validated['check_out'])) {
            $validated['check_out'] = Carbon::parse($validated['date'] . ' ' . $validated['check_out'])->toDateTimeString();
        }
        $validated['status'] = $status;

        $attendance = Attendance::create($validated);
        return $this->ok($attendance, 'Attendance recorded successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'approve attendance');
        $attendance = Attendance::findOrFail($id);
        $validated = $request->validate([
            'date' => 'sometimes|date',
            'check_in' => 'nullable|date_format:H:i',
            'check_out' => 'nullable|date_format:H:i',
            'status' => 'sometimes|in:present,absent,leave,late',
            'notes' => 'nullable|string',
        ]);

        $date = $validated['date'] ?? $attendance->date;
        if (!empty($validated['check_in'])) {
            $validated['check_in'] = Carbon::parse($date . ' ' . $validated['check_in'])->toDateTimeString();
        }
        if (!empty($validated['check_out'])) {
            $validated['check_out'] = Carbon::parse($date . ' ' . $validated['check_out'])->toDateTimeString();
        }

        $policy = AttendancePolicy::query()->first();
        if (!empty($validated['check_in'])) {
            $currentStatus = $validated['status'] ?? $attendance->status;
            $validated['status'] = $this->deriveStatusFromCheckIn($validated['check_in'], $policy, $currentStatus);
        }

        $attendance->update($validated);
        return $this->ok($attendance, 'Attendance updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage attendance');
        Attendance::findOrFail($id)->delete();
        return $this->ok(null, 'Attendance deleted successfully');
    }

    public function getByEmployee($employeeId, Request $request)
    {
        $this->authorizeAttendanceAccess($request, (int) $employeeId);

        $query = Attendance::where('employee_id', $employeeId);
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

        $today = Carbon::today();
        $attendance = Attendance::where('employee_id', $validated['employee_id'])->whereDate('date', $today)->first();

        if (!$attendance) {
            $checkIn = Carbon::now()->toDateTimeString();
            $attendance = Attendance::create([
                'employee_id' => $validated['employee_id'],
                'date' => $today,
                'check_in' => $checkIn,
                'status' => $this->deriveStatusFromCheckIn($checkIn, AttendancePolicy::first(), 'present'),
            ]);
        }

        return $this->ok($attendance, 'Check-in successful');
    }

    public function checkOut(Request $request)
    {
        $validated = $request->validate(['employee_id' => 'required|exists:employees,id']);
        $this->authorizeAttendanceAccess($request, (int) $validated['employee_id']);

        $attendance = Attendance::where('employee_id', $validated['employee_id'])->whereDate('date', Carbon::today())->first();
        if (!$attendance) {
            return $this->fail('No check-in record found for today.', 404);
        }
        $attendance->update(['check_out' => Carbon::now()->toDateTimeString()]);
        return $this->ok($attendance, 'Check-out successful');
    }

    public function companyMonthlySummary(Request $request)
    {
        $this->authorizePermission($request, 'view attendance');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $rows = Attendance::whereMonth('date', $validated['month'])
            ->whereYear('date', $validated['year'])
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

    public function getPolicy(Request $request)
    {
        $this->authorizePermission($request, 'manage attendance');
        return $this->ok(AttendancePolicy::query()->first());
    }

    public function updatePolicy(Request $request)
    {
        $this->authorizePermission($request, 'manage attendance');
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

    private function deriveStatusFromCheckIn(string $checkInDateTime, ?AttendancePolicy $policy, string $fallbackStatus): string
    {
        if (!$policy) {
            return $fallbackStatus;
        }
        if ($policy->allow_manual_status_override && $fallbackStatus !== 'present') {
            return $fallbackStatus;
        }

        $checkIn = Carbon::parse($checkInDateTime);
        $threshold = Carbon::parse($checkIn->toDateString() . ' ' . $policy->late_after_time);
        return $checkIn->greaterThan($threshold) ? 'late' : 'present';
    }

    private function authorizeAttendanceAccess(Request $request, int $employeeId): void
    {
        if ($request->user()?->can('manage attendance')) {
            return;
        }

        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if (!$employee || $employee->id !== $employeeId) {
            abort(403, 'You are not authorized to perform this action for this employee.');
        }
    }
}
