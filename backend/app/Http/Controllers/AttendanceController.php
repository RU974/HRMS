<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Employee;
use App\Models\Shift;
use App\Services\ShiftResolver;
use App\Models\User;
use App\Services\AttendanceCalculator;
use App\Services\AttendancePolicyResolver;
use App\Services\AttendanceStatusRecalculator;
use App\Http\Requests\UpdateAttendancePolicyRequest;
use App\Services\AttendanceNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Attendance::with('employee');
        $this->scopeToCompany($request, $query, 'employee.user');
        if ($this->isLineManagerOnly($request)) {
            $query->whereHas('employee', fn ($q) => $this->scopeToOwnTeam($q, $request));
        } else {
            $this->applyManagedEmployeeScope($request, $query, 'employee');
        }

        if ($request->filled('employee_id')) {
            $employeeId = (int) $request->employee_id;
            if (!$user?->can('attendance:manage_settings')) {
                $this->authorizeAttendanceAccess($request, $employeeId);
            }
            $this->assertEmployeeInCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        } elseif ($user?->can('attendance:manage_settings') || $user?->can('attendance:approve')) {
            // Only managers/admins can see all company records
        } elseif ($this->canViewTeamAttendance($request)) {
            // Line managers: managed-employee scope above limits this to their team
        } else {
            // Regular employees: scope to own records only
            $employee = Employee::where('user_id', $request->user()?->id)->first();
            if (!$employee) {
                return $this->ok(['data' => [], 'total' => 0]);
            }
            $query->where('employee_id', $employee->id);
        }

        if ($request->filled('date')) {
            $query->whereDate('date', $request->date);
        }
        if ($request->filled('month')) {
            $query->whereMonth('date', $request->month);
        }
        if ($request->filled('year')) {
            $query->whereYear('date', $request->year);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('date', '<=', $request->date_to);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->input('search')) . '%';
            $query->whereHas('employee', fn ($q) => $q->where(function ($s) use ($term) {
                $s->where('name', 'like', $term)
                    ->orWhere('employee_number', 'like', $term);
            }));
        }
        $query->orderByDesc('date')->orderByDesc('id');

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
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
            'status'         => 'nullable|in:'.implode(',', Attendance::ALL_STATUSES),
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

        $policy = AttendancePolicy::forEmployee(Employee::find($validated['employee_id']));
        $shift = $this->getEmployeeShift((int) $validated['employee_id'], $validated['date']);
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
            $validated['check_out'] = $this->attendanceCalculator()->resolveCheckOut(
                $validated['date'],
                $validated['check_in'] ?? null,
                $validated['check_out']
            );
        }

        if (!empty($validated['check_in']) && !empty($validated['check_out'])) {
            $status = $this->closedDayStatus($status, $validated['check_in'], $validated['check_out'], $policy, $shift);
        }

        // Only a check-out was given: flag it, as the biometric sync and the recompute do,
        // instead of recording a clean "present" day (unless a status was chosen on purpose).
        if (empty($validated['check_in']) && !empty($validated['check_out']) && empty($request->input('status'))) {
            $status = Attendance::STATUS_MISSING_CHECK_IN;
            $validated['notes'] = $validated['notes']
                ?? 'Check-in missing: only a check-out punch (' . Carbon::parse($validated['check_out'])->format('H:i') . ') was recorded.';
        }

        $validated['status'] = $status;

        $attendance = Attendance::create($validated);
        return $this->ok($attendance, 'Attendance recorded successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:manage_settings|attendance:approve');
        $attendance = Attendance::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);
        $validated = $request->validate([
            'date'           => 'sometimes|date',
            'check_in'       => 'nullable|date_format:H:i',
            'check_out'      => 'nullable|date_format:H:i',
            'status'         => 'sometimes|in:'.implode(',', Attendance::ALL_STATUSES),
            'work_from_home' => 'nullable|boolean',
            'notes'          => 'nullable|string',
        ]);

        $date = Carbon::parse($validated['date'] ?? $attendance->date)->toDateString();
        if (!empty($validated['check_in'])) {
            $validated['check_in'] = $this->attendanceCalculator()->normalizeCheckTime($date, $validated['check_in']);
        }
        if (!empty($validated['check_out'])) {
            // Night shifts: a check-out earlier than the check-in clock time is the next day.
            $validated['check_out'] = $this->attendanceCalculator()->resolveCheckOut(
                $date,
                $validated['check_in'] ?? ($attendance->check_in ? Carbon::parse($attendance->check_in)->toDateTimeString() : null),
                $validated['check_out']
            );
        }

        $policy = AttendancePolicy::forEmployee($attendance->employee);
        // The shift the day was frozen with; only a record moved to another date is judged by that date's shift.
        $shift = $date === Carbon::parse($attendance->date)->toDateString()
            ? $attendance->judgingShift()
            : ($attendance->employee ? app(ShiftResolver::class)->on($attendance->employee, $date)->shift : null);

        // Judge the times the record will end up with, not just the ones in this request:
        // moving only the check-in past the stored check-out is just as invalid.
        if (array_key_exists('check_in', $validated) || array_key_exists('check_out', $validated)) {
            $finalIn = array_key_exists('check_in', $validated)
                ? ($validated['check_in'] ?: null)
                : $attendance->check_in?->toDateTimeString();
            $finalOut = array_key_exists('check_out', $validated)
                ? ($validated['check_out'] ?: null)
                : $attendance->check_out?->toDateTimeString();
            if ($finalIn && $finalOut && Carbon::parse($finalOut)->lessThan(Carbon::parse($finalIn))) {
                return $this->fail('Check-out cannot be earlier than check-in.', 422);
            }
        }

        // The status follows the punches (late / missing flags clear or appear as the times
        // change). A status the admin deliberately picked in this request is kept when the
        // policy allows manual overrides.
        $explicitStatus = isset($validated['status']) && $validated['status'] !== $attendance->status
            && ($policy?->allow_manual_status_override ?? true);
        $preview = $attendance->replicate(['overtime_hours', 'duration_hours']);
        $preview->status = $attendance->status;
        foreach (['check_in', 'check_out'] as $field) {
            if (array_key_exists($field, $validated)) {
                $preview->{$field} = $validated[$field];
            }
        }
        if (!$explicitStatus) {
            $validated['status'] = $this->attendanceCalculator()->recomputeStatus($preview, $policy, $shift);
        } else {
            // A person overrode the status: later edits of the punches do not re-judge it.
            $validated['status_reason'] = Attendance::REASON_MANUAL;
        }

        $attendance->update($validated);
        return $this->ok($attendance, 'Attendance updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $attendance = Attendance::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);
        // Leave rows belong to the leave; deleting one by hand would only be undone by the next sync.
        if ($attendance->leave_id && in_array($attendance->status, ['leave', Attendance::STATUS_HALF_DAY], true)) {
            return $this->fail('This day comes from an approved leave. Cancel or edit the leave instead.', 422);
        }
        $attendance->delete();
        return $this->ok(null, 'Attendance deleted successfully');
    }

    // GET /attendance/export — CSV of the records the caller may see, honouring the list filters.
    public function export(Request $request)
    {
        $user = $request->user();
        $isManager = $user?->can('attendance:manage_settings') || $user?->can('attendance:approve');

        $query = Attendance::with('employee');
        $this->scopeToCompany($request, $query, 'employee.user');
        if ($isManager) {
            $this->applyManagedEmployeeScope($request, $query, 'employee');
        } else {
            // Self-service: everyone else exports only their own records.
            $own = Employee::where('user_id', $user?->id)->value('id');
            abort_unless($own, 403, 'You are not authorized to export attendance.');
            $query->where('employee_id', $own);
        }

        if ($request->filled('date')) {
            $query->whereDate('date', $request->date);
        }
        if ($request->filled('month')) {
            $query->whereMonth('date', $request->month);
        }
        if ($request->filled('year')) {
            $query->whereYear('date', $request->year);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('date', '<=', $request->date_to);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->input('search')) . '%';
            $query->whereHas('employee', fn ($q) => $q->where(function ($s) use ($term) {
                $s->where('name', 'like', $term)->orWhere('employee_number', 'like', $term);
            }));
        }

        $query->orderBy('date', 'desc')->orderBy('id');

        return response()->streamDownload(function () use ($query): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['employee_number', 'employee_name', 'date', 'check_in', 'check_out', 'status', 'work_from_home', 'source', 'notes']);
            foreach ($query->cursor() as $a) {
                fputcsv($out, [
                    $a->employee?->employee_number,
                    $a->employee?->name,
                    $a->date?->toDateString(),
                    $a->check_in?->format('H:i'),
                    $a->check_out?->format('H:i'),
                    $a->status,
                    $a->work_from_home ? 'yes' : 'no',
                    $a->source ?? 'manual',
                    $a->notes,
                ]);
            }
            fclose($out);
        }, 'attendance-' . now()->toDateString() . '.csv', ['Content-Type' => 'text/csv']);
    }

    // POST /attendance/import — CSV with employee_number,date,check_in,check_out,status,work_from_home,notes.
    // Existing employee+date records are skipped, never overwritten.
    public function import(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:2048']);

        $handle = fopen($request->file('file')->getRealPath(), 'r');
        $header = $handle ? fgetcsv($handle) : false;
        if (!$header) {
            return $this->fail('The CSV file is empty.', 422);
        }
        $header = array_map(fn ($h) => strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), $header);
        if (!in_array('date', $header, true)) {
            return $this->fail('Missing required column: date.', 422);
        }
        // An export leaves employee_number blank for people without one, so the name identifies them.
        if (!in_array('employee_number', $header, true) && !in_array('employee_name', $header, true)) {
            return $this->fail('Missing required column: employee_number (or employee_name).', 422);
        }

        $employeesQuery = Employee::query();
        $this->scopeToCompany($request, $employeesQuery);
        $this->applyManagedEmployeeScope($request, $employeesQuery);
        $allEmployees = $employeesQuery->get();
        $employees = $allEmployees->filter(fn ($e) => trim((string) $e->employee_number) !== '')
            ->keyBy(fn ($e) => strtolower((string) $e->employee_number));
        $nameCounts = $allEmployees->countBy(fn ($e) => strtolower(trim((string) $e->name)));
        $employeesByName = $allEmployees->keyBy(fn ($e) => strtolower(trim((string) $e->name)));

        $calc = $this->attendanceCalculator();
        $imported = 0;
        $skipped = 0;
        $errors = [];
        $line = 1;

        while (($cols = fgetcsv($handle)) !== false) {
            $line++;
            if (count(array_filter($cols, fn ($c) => trim((string) $c) !== '')) === 0) {
                continue;
            }
            $row = array_combine($header, array_pad(array_slice($cols, 0, count($header)), count($header), ''));
            $row = array_map(fn ($v) => trim((string) $v), $row);

            $number = $row['employee_number'] ?? '';
            $name = strtolower($row['employee_name'] ?? '');
            $label = $number !== '' ? $number : ($row['employee_name'] ?? '');
            if ($number === '' && $name !== '' && ($nameCounts[$name] ?? 0) > 1) {
                $errors[] = "Line {$line}: more than one employee is named '{$row['employee_name']}'; use employee_number.";
                $skipped++;
                continue;
            }
            $employee = $number !== '' ? $employees->get(strtolower($number)) : ($name !== '' ? $employeesByName->get($name) : null);
            if (!$employee) {
                $errors[] = "Line {$line}: employee '{$label}' not found.";
                $skipped++;
                continue;
            }
            try {
                $date = Carbon::createFromFormat('Y-m-d', $row['date'])->toDateString();
            } catch (\Throwable) {
                $errors[] = "Line {$line}: date must be YYYY-MM-DD.";
                $skipped++;
                continue;
            }
            $status = strtolower($row['status'] ?? '') ?: 'present';
            if (!in_array($status, Attendance::ALL_STATUSES, true)) {
                $errors[] = "Line {$line}: invalid status '{$status}'.";
                $skipped++;
                continue;
            }
            foreach (['check_in', 'check_out'] as $f) {
                if (($row[$f] ?? '') !== '' && !preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $row[$f])) {
                    $errors[] = "Line {$line}: {$f} must be HH:MM (24h).";
                    $skipped++;
                    continue 2;
                }
            }
            if (Attendance::where('employee_id', $employee->id)->whereDate('date', $date)->exists()) {
                $errors[] = "Line {$line}: record already exists for {$label} on {$date}.";
                $skipped++;
                continue;
            }

            $checkIn = ($row['check_in'] ?? '') !== '' ? $calc->normalizeCheckTime($date, $row['check_in']) : null;
            $checkOut = ($row['check_out'] ?? '') !== '' ? $calc->resolveCheckOut($date, $checkIn, $row['check_out']) : null;
            if ($checkIn) {
                $policy = AttendancePolicy::forEmployee($employee);
                $shift = app(ShiftResolver::class)->on($employee, $date)->shift;
                $status = $calc->deriveStatusFromCheckIn($policy, $shift, $checkIn, $status);
                if ($checkOut) {
                    $status = $this->closedDayStatus($status, $checkIn, $checkOut, $policy, $shift);
                }
            }

            Attendance::create([
                'employee_id'    => $employee->id,
                'date'           => $date,
                'check_in'       => $checkIn,
                'check_out'      => $checkOut,
                'status'         => $status,
                'source'         => in_array(strtolower($row['source'] ?? ''), ['biometric', 'manual', 'mobile', 'web'], true)
                    ? strtolower($row['source']) : 'manual',
                'work_from_home' => in_array(strtolower($row['work_from_home'] ?? ''), ['1', 'yes', 'true', 'y'], true),
                'notes'          => ($row['notes'] ?? '') ?: null,
            ]);
            $imported++;
        }
        fclose($handle);

        return $this->ok(
            ['imported' => $imported, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 50)],
            "Imported {$imported} record(s), skipped {$skipped}."
        );
    }

    public function getByEmployee($employeeId, Request $request)
    {
        $this->authorizeAttendanceAccess($request, (int) $employeeId);
        $this->assertEmployeeInCompany($request, (int) $employeeId);

        $query = Attendance::where('employee_id', $employeeId);
        $this->applyManagedEmployeeScope($request, $query, 'employee');
        if ($request->filled('month')) {
            $query->whereMonth('date', $request->month);
        }
        if ($request->filled('year')) {
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

        $records = Attendance::with('employee')
            ->where('employee_id', $employeeId)
            ->whereMonth('date', $month)
            ->whereYear('date', $year)
            ->get();

        // "N lates = 1 absent": late arrivals (and early leaves, when the policy counts them) add up to absences.
        $policy = AttendancePolicy::forEmployee($records->first()?->employee ?? Employee::find($employeeId));
        $lateCount = (int) $stats->where('status', 'late')->sum('count');
        $earlyLeaves = $records->where('is_early_leave', true)->count();
        // A day that is already "late" is not counted twice.
        $earlyNotLate = $records->where('is_early_leave', true)->where('status', '!=', 'late')->count();
        $countedLates = $lateCount + ($policy?->early_leave_counts_as_late ? $earlyNotLate : 0);
        $latesPerAbsent = (int) ($policy?->lates_per_absent ?? 0);
        $absentFromLates = $latesPerAbsent > 0 ? intdiv($countedLates, $latesPerAbsent) : 0;

        return $this->ok([
            'early_leave' => $earlyLeaves,
            'short_hours' => $records->where('is_short_hours', true)->count(),
            'lates_per_absent' => $latesPerAbsent,
            'absent_from_lates' => $absentFromLates,
            'effective_absent' => (int) $stats->where('status', 'absent')->sum('count') + $absentFromLates,
            'total_hours' => round($records->sum('duration_hours'), 1),
            'overtime_hours' => round($records->sum('overtime_hours'), 1),
            'wfh_days' => $records->where('work_from_home', true)->count(),
            'total_days' => $stats->sum('count'),
            'present' => $stats->where('status', 'present')->sum('count'),
            'absent' => $stats->where('status', 'absent')->sum('count'),
            'leave' => $stats->where('status', 'leave')->sum('count'),
            // Leave measured in days: a half-day leave counts as 0.5.
            'leave_days' => $stats->where('status', 'leave')->sum('count') + 0.5 * Attendance::where('employee_id', $employeeId)
                ->whereMonth('date', $month)->whereYear('date', $year)
                ->where('status', 'half_day')->whereNotNull('leave_id')->count(),
            'half_day' => $stats->where('status', 'half_day')->sum('count'),
            'late' => $stats->where('status', 'late')->sum('count'),
            'missing_check_in' => $stats->where('status', 'missing_check_in')->sum('count'),
            'missing_check_out' => $stats->where('status', 'missing_check_out')->sum('count'),
            'off_days' => $this->countWeeklyOffDays((int) $employeeId, (int) $month, (int) $year),
        ]);
    }

    /** Unmarked weekly-off days (e.g. Saturday/Sunday) up to today for the month. */
    private function countWeeklyOffDays(int $employeeId, int $month, int $year): int
    {
        $employee = Employee::find($employeeId);
        if (!$employee) {
            return 0;
        }
        $service = app(\App\Services\AttendanceAbsenceService::class);
        $start = Carbon::create($year, $month, 1)->startOfDay();
        $end   = $start->copy()->endOfMonth()->startOfDay();
        if ($end->gt(Carbon::today())) {
            $end = Carbon::today();
        }
        $count = 0;
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            if (!$service->isWorkingDay($employee, $d)) {
                $count++;
            }
        }
        return $count;
    }

    public function checkIn(Request $request)
    {
        $validated = $request->validate(['employee_id' => 'required|exists:employees,id']);
        $this->authorizeAttendanceAccess($request, (int) $validated['employee_id']);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $today = Carbon::today();
        $attendance = Attendance::where('employee_id', $validated['employee_id'])->whereDate('date', $today)->first();
        $employee = Employee::find($validated['employee_id']);
        $policy = AttendancePolicy::forEmployee($employee);
        $resolver = app(ShiftResolver::class);
        $shift = $employee ? $resolver->on($employee, $today)->shift : null;
        $now = Carbon::now();

        // Overnight if today's shift runs past midnight, or last night's did (the open record is then still today's).
        $overnight = $this->attendanceCalculator()->isOvernightShift($shift)
            || ($employee && $this->attendanceCalculator()->isOvernightShift($resolver->on($employee, $today->copy()->subDay())->shift));
        if (!$attendance && $overnight) {
            $open = $this->findOpenPreviousDayRecord((int) $validated['employee_id'], $now);
            if ($open) {
                return $this->ok($open, 'Already checked in (night shift in progress)');
            }
        }

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
            'status' => $this->attendanceCalculator()->statusForPunch(
                $attendance,
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
        if (!$attendance || $attendance->check_out) {
            // Night shift: the open record belongs to the previous calendar day.
            $open = $this->findOpenPreviousDayRecord((int) $validated['employee_id'], Carbon::now());
            if ($open) {
                $attendance = $open;
            }
        }
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

        // Hours worked are only known now, so the minimum-hours rules are judged at check-out.
        if ($attendance->check_in && in_array($attendance->status, ['present', 'late', Attendance::STATUS_MISSING_CHECK_OUT], true)) {
            $update['status'] = $this->closedDayStatus(
                'present',
                $attendance->check_in->toDateTimeString(),
                $update['check_out'],
                AttendancePolicy::forEmployee($attendance->employee),
                $attendance->judgingShift()
            );
        }

        $attendance->update($update);
        return $this->ok($attendance, 'Check-out successful');
    }

    /**
     * Status of a day that has both punches: late / present from the check-in, then the
     * policy's half-day and minimum-hours rules. A status picked by hand is kept as is.
     */
    private function closedDayStatus(string $status, string $checkIn, string $checkOut, ?AttendancePolicy $policy, ?Shift $shift): string
    {
        if (in_array($status, Attendance::MANUAL_STATUSES, true)) {
            return $status;
        }

        $preview = new Attendance(['check_in' => $checkIn, 'check_out' => $checkOut, 'status' => $status]);

        return $this->attendanceCalculator()->recomputeStatus($preview, $policy, $shift);
    }

    /**
     * Yesterday's record that is still open (checked in, not out) and whose check-in
     * is recent enough to be the same night shift.
     */
    private function findOpenPreviousDayRecord(int $employeeId, Carbon $now): ?Attendance
    {
        return Attendance::where('employee_id', $employeeId)
            ->whereDate('date', $now->copy()->subDay()->toDateString())
            ->whereNotNull('check_in')
            ->whereNull('check_out')
            ->where('check_in', '>=', $now->copy()->subHours(20)->toDateTimeString())
            ->first();
    }

    public function listCorrections(Request $request)
    {
        $user = $request->user();
        $query = Attendance::with('employee')->whereNotNull('correction_status');

        if ($request->filled('employee_id')) {
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

        if ($request->filled('status')) {
            $query->where('correction_status', $request->status);
        }

        if ($request->filled('month')) {
            $query->whereMonth('date', $request->month);
        }
        if ($request->filled('year')) {
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
            ->whereYear('date', $validated['year']);
        $this->scopeToCompany($request, $rows, 'employee.user');

        $this->applyManagedEmployeeScope($request, $rows, 'employee');

        $halfDayLeaves = (clone $rows)->where('status', 'half_day')->whereNotNull('leave_id')->count();

        $policy = AttendancePolicy::forCompany($request->user()?->company_id ? (string) $request->user()->company_id : null);
        $employeeIds = (clone $rows)->distinct()->pluck('employee_id')->all();
        $fromLates = array_sum($this->absencesFromLates($employeeIds, (int) $validated['month'], (int) $validated['year'], $policy));
        $earlyLeaves = $policy?->early_leave_enabled
            ? $this->earlyLeaveRows($employeeIds, (int) $validated['month'], (int) $validated['year'], $policy)->count()
            : 0;

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
            'leave_days' => (float) ($rows->where('status', 'leave')->sum('count') + 0.5 * $halfDayLeaves),
            'half_day' => (int) $rows->where('status', 'half_day')->sum('count'),
            'late' => (int) $rows->where('status', 'late')->sum('count'),
            'missing_check_in' => (int) $rows->where('status', 'missing_check_in')->sum('count'),
            'missing_check_out' => (int) $rows->where('status', 'missing_check_out')->sum('count'),
            'early_leave' => $earlyLeaves,
            'lates_per_absent' => (int) ($policy?->lates_per_absent ?? 0),
            'absent_from_lates' => $fromLates,
        ]);
    }

    /** Closed-day rows of these employees in the month that count as an early leave. */
    private function earlyLeaveRows(array $employeeIds, int $month, int $year, ?AttendancePolicy $policy)
    {
        if (!$policy?->early_leave_enabled || $employeeIds === []) {
            return collect();
        }

        return Attendance::with('employee')
            ->whereIn('employee_id', $employeeIds)
            ->whereMonth('date', $month)->whereYear('date', $year)
            ->whereNotNull('check_in')->whereNotNull('check_out')
            ->get()
            ->filter(fn (Attendance $a) => $a->is_early_leave);
    }

    /**
     * Absences created by "N lates = 1 absent", per employee id, for one month. Lates are the
     * "late" records, plus early leaves when the policy counts them as lates.
     *
     * @param  array<int>  $employeeIds
     * @return array<int, int>
     */
    private function absencesFromLates(array $employeeIds, int $month, int $year, ?AttendancePolicy $policy): array
    {
        $n = (int) ($policy?->lates_per_absent ?? 0);
        if ($n <= 0 || $employeeIds === []) {
            return [];
        }

        $lates = Attendance::whereIn('employee_id', $employeeIds)
            ->whereMonth('date', $month)->whereYear('date', $year)
            ->where('status', 'late')
            ->selectRaw('employee_id, COUNT(*) as count')->groupBy('employee_id')
            ->pluck('count', 'employee_id')->map(fn ($c) => (int) $c)->all();

        if ($policy->early_leave_counts_as_late) {
            foreach ($this->earlyLeaveRows($employeeIds, $month, $year, $policy)->where('status', '!=', 'late') as $row) {
                $lates[$row->employee_id] = ($lates[$row->employee_id] ?? 0) + 1;
            }
        }

        return array_map(fn ($count) => intdiv($count, $n), $lates);
    }

    public function teamDailyView(Request $request)
    {
        if (!$this->canViewTeamAttendance($request)) {
            $this->authorizePermission($request, 'attendance:approve');
        }
        ['date' => $date] = $request->validate(['date' => 'required|date']);

        $user = $request->user();
        $date = Carbon::parse($date)->toDateString();

        $employeeQuery = Employee::with(['department'])->where('status', 'active');
        $this->scopeToCompany($request, $employeeQuery);

        // Non-admin managers: own department, direct reports and themselves only
        if (!$user?->can('attendance:manage_settings')) {
            $employeeQuery->where(fn ($q) => $this->scopeToOwnTeam($q, $request));
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

        // "N lates = 1 absent": absences created by the policy's late rule, per person for the month.
        $policy = AttendancePolicy::forCompany($user?->company_id ? (string) $user->company_id : null);
        $fromLates = $this->absencesFromLates($ids->all(), (int) $month, (int) $year, $policy);

        $result = $employees->map(fn ($emp) => [
            'employee_id'      => $emp->id,
            'name'             => $emp->name,
            'department'       => $emp->department?->name,
            'designation'      => $emp->designation,
            'attendance'       => $attendances->get($emp->id),
            'monthly_absences' => (int) ($monthlyAbsences->get($emp->id) ?? 0),
            'absent_from_lates' => (int) ($fromLates[$emp->id] ?? 0),
        ]);

        return $this->ok($result);
    }

    public function getPolicy(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        // The caller's own company policy (or the default it inherits until it saves one).
        $companyId = $request->user()?->company_id ? (string) $request->user()->company_id : null;
        $policy = AttendancePolicy::forCompany($companyId);

        return $this->ok($this->policyPayload($policy, $companyId));
    }

    public function updatePolicy(UpdateAttendancePolicyRequest $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $validated = $request->validated();

        // Each company owns its policy; a super admin without a company edits the global default.
        $companyId = $request->user()?->company_id ? (string) $request->user()->company_id : null;
        $policy = AttendancePolicy::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId), fn ($q) => $q->whereNull('company_id'))
            ->first();

        if (!$policy) {
            // First save for this company: start from what it was inheriting so unsent rules keep their value.
            $inherited = AttendancePolicy::forCompany($companyId);
            $policy = new AttendancePolicy(['name' => 'Default']);
            $policy->company_id = $companyId;
            $policy->fill($inherited ? $inherited->only(AttendancePolicy::RULE_FIELDS) : AttendancePolicy::defaults());
        }

        $rules = array_intersect_key($validated, array_flip(AttendancePolicy::RULE_FIELDS));
        $rules['late_after_time'] = $validated['late_after_time'] . ':00';
        if (!empty($rules['early_leave_before_time'])) {
            $rules['early_leave_before_time'] .= ':00';
        }
        $policy->fill($rules)->save();
        app(AttendancePolicyResolver::class)->forget();

        $recalculated = null;
        if (!empty($validated['apply_from'])) {
            $recalculated = app(AttendanceStatusRecalculator::class)
                ->recalculate(Carbon::parse($validated['apply_from']), null, null, true, null, $companyId);
        }

        return $this->ok(
            $this->policyPayload($policy->fresh(), $companyId) + ['recalculated_records' => $recalculated],
            'Attendance policy updated successfully'
        );
    }

    /** @return array<string, mixed> */
    private function policyPayload(?AttendancePolicy $policy, ?string $companyId): array
    {
        $values = $policy ? $policy->only(AttendancePolicy::RULE_FIELDS) : AttendancePolicy::defaults();

        return ['id' => $policy?->id, 'company_id' => $policy?->company_id, 'name' => $policy?->name ?? 'Default']
            + $values
            + ['inherited' => !AttendancePolicy::ownedBy($companyId)];
    }

    public function requestCorrection(Request $request, $id)
    {
        $attendance = Attendance::findOrFail($id);
        $this->authorizeAttendanceAccess($request, (int) $attendance->employee_id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);

        $validated = $request->validate([
            'correction_request_notes' => 'required|string|max:2000',
            'proposed_check_in'  => 'nullable|date_format:H:i',
            'proposed_check_out' => 'nullable|date_format:H:i',
        ]);

        if ($attendance->correction_status === 'pending') {
            return $this->fail('A correction request is already pending for this attendance.', 422);
        }

        $attendance->update([
            'correction_status' => 'pending',
            'correction_request_notes' => $validated['correction_request_notes'],
            'correction_proposed_check_in' => $validated['proposed_check_in'] ?? null,
            'correction_proposed_check_out' => $validated['proposed_check_out'] ?? null,
            'correction_requested_at' => Carbon::now(),
            'correction_response_notes' => null,
            'correction_reviewed_at' => null,
        ]);
        app(AttendanceNotificationService::class)->correctionRequested($attendance);

        return $this->ok($attendance, 'Correction request submitted successfully');
    }

    public function reviewCorrection(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:approve');

        $attendance = Attendance::with('employee')->findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $attendance->employee_id);

        $validated = $request->validate([
            'correction_status' => 'required|in:pending,approved,rejected',
            'correction_response_notes' => 'nullable|string',
        ]);

        if ($attendance->correction_status !== 'pending') {
            return $this->fail('Only pending correction requests can be reviewed.', 422);
        }
        if ($validated['correction_status'] === 'pending') {
            return $this->fail('Choose approved or rejected.', 422);
        }
        if ($attendance->employee?->user_id === $request->user()?->id) {
            return $this->fail('You cannot review your own correction request.', 403);
        }

        $update = [
            'correction_status' => $validated['correction_status'],
            'correction_response_notes' => $validated['correction_response_notes'] ?? $attendance->correction_response_notes,
            'correction_reviewed_at' => Carbon::now(),
        ];

        // Approving applies the times the employee proposed (if any) to the record.
        if ($validated['correction_status'] === 'approved'
            && ($attendance->correction_proposed_check_in || $attendance->correction_proposed_check_out)) {
            $calc = $this->attendanceCalculator();
            $date = $attendance->date->toDateString();
            $in = $attendance->correction_proposed_check_in
                ? $calc->normalizeCheckTime($date, substr((string) $attendance->correction_proposed_check_in, 0, 5))
                : $attendance->check_in?->toDateTimeString();
            $out = $attendance->correction_proposed_check_out
                ? $calc->resolveCheckOut($date, $in, substr((string) $attendance->correction_proposed_check_out, 0, 5))
                : $attendance->check_out?->toDateTimeString();
            if ($in && $out && Carbon::parse($out)->lessThan(Carbon::parse($in))) {
                return $this->fail('The proposed check-out is earlier than the check-in.', 422);
            }
            $update['check_in'] = $in;
            $update['check_out'] = $out;
            $preview = $attendance->replicate(['overtime_hours', 'duration_hours']);
            $preview->status_reason = null; // new times: the policy judges them afresh
            $preview->check_in = $in;
            $preview->check_out = $out;
            $update['status_reason'] = null;
            $update['status'] = $calc->recomputeStatus(
                $preview,
                AttendancePolicy::forEmployee($attendance->employee),
                $attendance->judgingShift()
            );
        } elseif ($validated['correction_status'] === 'approved') {
            // No new times proposed: the reviewer accepted the employee's explanation
            // (e.g. they were within their grace period), so "late" is cleared.
            if ($attendance->check_in && ($attendance->status === 'late' || $attendance->status_reason === Attendance::REASON_POLICY)) {
                $update['status'] = 'present';
            }
        }

        $attendance->update($update);
        app(AttendanceNotificationService::class)->correctionReviewed($attendance, $request->user()?->id);

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

    /** The shift the employee is scheduled on for a date (roster, rotation, swap or override before their default). */
    private function getEmployeeShift(int $employeeId, string $date)
    {
        $employee = Employee::find($employeeId);

        return $employee ? app(ShiftResolver::class)->on($employee, $date)->shift : null;
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

        // Line managers (read-only) can access their own team's records
        if ($this->canViewTeamAttendance($request)) {
            $this->assertEmployeeInCompany($request, $employeeId);
            $inTeam = Employee::query()->whereKey($employeeId)
                ->where(fn ($q) => $this->scopeToOwnTeam($q, $request))
                ->exists();
            if (!$inTeam) {
                abort(403, 'You are not authorized to access this attendance record.');
            }
            return;
        }

        // Regular employees can only access their own records
        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if (!$employee || (int)$employee->id !== $employeeId) {
            abort(403, 'You are not authorized to perform this action for this employee.');
        }
    }

    private function isLineManagerOnly(Request $request): bool
    {
        $user = $request->user();

        return $this->canViewTeamAttendance($request)
            && !$user->can('attendance:manage_settings')
            && !$user->can('attendance:approve');
    }

    /** Limits an Employee query to the manager, their direct reports and their department. */
    private function scopeToOwnTeam($query, Request $request): void
    {
        $mgr = $request->user()?->employee;
        if (!$mgr) {
            $query->whereRaw('1 = 0');
            return;
        }

        $query->where(function ($q) use ($mgr): void {
            $q->where('id', $mgr->id)->orWhere('manager_id', $mgr->id);
            if ($mgr->department_id) {
                $q->orWhere('department_id', $mgr->department_id);
            }
        });
    }

    /**
     * Read-only team access for line managers (e.g. Department Manager): holds
     * employees:view and attendance:view but not the company-wide view_all.
     */
    private function canViewTeamAttendance(Request $request): bool
    {
        $user = $request->user();

        return (bool) $user
            && $user->can('attendance:view')
            && $user->can('employees:view')
            && !$user->can('employees:view_all')
            && $user->employee !== null;
    }
}
