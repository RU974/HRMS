<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesRosterView;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\Shift;
use App\Models\ShiftAssignment;
use App\Models\ShiftOverride;
use App\Models\ShiftRotation;
use App\Models\ShiftSwap;
use App\Services\ScheduledShift;
use App\Services\ShiftNotificationService;
use App\Services\ShiftResolver;
use App\Services\ShiftScheduleService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Rosters: who works which shift on which day. The roster grid and "my schedule" read through
 * ShiftResolver; assignments (date ranges) and overrides (single days) are the writes.
 */
class ShiftScheduleController extends Controller
{
    use AuthorizesRosterView;

    private const MAX_GRID_DAYS = 62;
    private const MAX_CELLS = 3000;

    public function __construct(private ShiftResolver $resolver, private ShiftScheduleService $schedule)
    {
    }

    // ── Reading ────────────────────────────────────────────────────────────────

    /** The roster grid: one row per employee, one cell per day. */
    public function roster(Request $request)
    {
        $this->authorizeRosterView($request);
        $companyId = $this->companyId($request);
        [$from, $to] = $this->window($request, 14);

        $query = Employee::query()->where('company_id', $companyId)->where('status', 'active')->with('department:id,name');
        $this->applyManagedEmployeeScope($request, $query);
        if ($request->filled('department_id')) {
            $query->where('department_id', (int) $request->input('department_id'));
        }
        if ($request->filled('employee_ids')) {
            $query->whereIn('id', array_map('intval', (array) $request->input('employee_ids')));
        }
        if ($request->filled('search')) {
            $term = '%' . str_replace(['%', '_'], ['\\%', '\\_'], (string) $request->input('search')) . '%';
            $query->where('name', 'like', $term);
        }

        $perPage = max(1, min(100, (int) $request->input('per_page', 50)));
        $people = $query->orderBy('name')->paginate($perPage);
        if ($people->count() * ($from->diffInDays($to) + 1) > self::MAX_CELLS) {
            return $this->fail('Too many cells requested; narrow the date range or the employee list.', 422);
        }

        return $this->ok($this->grid($companyId, $people->getCollection(), $from, $to) + [
            'pagination' => ['page' => $people->currentPage(), 'per_page' => $people->perPage(), 'total' => $people->total(), 'last_page' => $people->lastPage()],
        ]);
    }

    /** The signed-in employee's own schedule, plus their swap requests. */
    public function mySchedule(Request $request)
    {
        $employee = $request->user()?->employee;
        if (!$employee) {
            return $this->fail('Your account is not linked to an employee record.', 404);
        }
        [$from, $to] = $this->window($request, 21);

        $swaps = ShiftSwap::withoutGlobalScopes()
            ->with(['requester:id,name', 'counterpart:id,name'])
            ->where(fn ($q) => $q->where('requester_id', $employee->id)->orWhere('counterpart_id', $employee->id))
            ->where(fn ($q) => $q->whereIn('status', [ShiftSwap::PENDING_PEER, ShiftSwap::PENDING_APPROVAL])
                ->orWhereDate('requester_date', '>=', $from->toDateString())->orWhereDate('counterpart_date', '>=', $from->toDateString()))
            ->latest()->limit(50)->get();

        return $this->ok($this->grid((string) $employee->company_id, collect([$employee]), $from, $to) + ['swaps' => $swaps]);
    }

    /** @return array{from: string, to: string} */
    private function window(Request $request, int $defaultDays): array
    {
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        $from = Carbon::parse($request->input('from', Carbon::today()->toDateString()))->startOfDay();
        $to = Carbon::parse($request->input('to', $from->copy()->addDays($defaultDays - 1)->toDateString()))->startOfDay();
        abort_if($to->lt($from), 422, 'The end date cannot be before the start date.');
        abort_if($from->diffInDays($to) + 1 > self::MAX_GRID_DAYS, 422, 'Pick at most ' . self::MAX_GRID_DAYS . ' days at a time.');

        return [$from, $to];
    }

    private function grid(string $companyId, $employees, Carbon $from, Carbon $to): array
    {
        $this->resolver->preload($employees, $from, $to);

        $holidays = Holiday::withoutGlobalScopes()->where('company_id', $companyId)->where('is_optional', false)
            ->whereBetween('holiday_date', [$from->toDateString(), $to->toDateString()])
            ->get(['holiday_date', 'name'])->mapWithKeys(fn ($h) => [Carbon::parse($h->holiday_date)->toDateString() => $h->name]);

        $leaves = Leave::query()->where('status', 'approved')->whereIn('employee_id', $employees->pluck('id'))
            ->whereDate('from_date', '<=', $to->toDateString())->whereDate('to_date', '>=', $from->toDateString())
            ->get(['employee_id', 'from_date', 'to_date', 'half_day'])->groupBy('employee_id');

        $days = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $days[] = $d->toDateString();
        }

        $rows = $employees->map(function (Employee $employee) use ($from, $to, $leaves) {
            $cells = [];
            foreach ($this->resolver->range($employee, $from, $to) as $date => $scheduled) {
                $cells[$date] = $this->cell($scheduled) + [
                    'on_leave' => $leaves->get($employee->id, collect())->contains(fn ($l) => $date >= Carbon::parse($l->from_date)->toDateString()
                        && $date <= Carbon::parse($l->half_day ? $l->from_date : $l->to_date)->toDateString()),
                ];
            }

            return [
                'id' => $employee->id,
                'name' => $employee->name,
                'department_id' => $employee->department_id,
                'department' => $employee->department?->name,
                'default_shift_id' => $employee->shift_id,
                'days' => $cells,
            ];
        })->values();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'dates' => $days,
            'holidays' => $holidays,
            'shifts' => Shift::withoutGlobalScopes()->where('company_id', $companyId)->orderBy('name')
                ->get(['id', 'name', 'start_time', 'end_time', 'continues_after_midnight', 'is_active']),
            'employees' => $rows,
        ];
    }

    private function cell(ScheduledShift $scheduled): array
    {
        $shift = $scheduled->shift;

        return [
            'shift_id' => $shift?->id,
            'name' => $shift?->name,
            'start_time' => $shift?->start_time ? substr((string) $shift->start_time, 0, 5) : null,
            'end_time' => $shift?->end_time ? substr((string) $shift->end_time, 0, 5) : null,
            'overnight' => (bool) $shift?->continues_after_midnight,
            'working' => $scheduled->isWorkingDay,
            'source' => $scheduled->source,
            'source_id' => $scheduled->sourceId,
        ];
    }

    // ── Assignments (roster ranges) ────────────────────────────────────────────

    public function assignments(Request $request)
    {
        $this->authorizeRosterView($request);
        $companyId = $this->companyId($request);

        $query = ShiftAssignment::withoutGlobalScopes()->where('company_id', $companyId)
            ->with(['employee:id,name', 'shift:id,name', 'rotation:id,name'])->orderByDesc('starts_on');
        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->input('employee_id'));
        }
        if ($request->boolean('current')) {
            $query->whereDate('starts_on', '<=', today())->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', today()));
        }
        $this->scopeEmployeeRelation($request, $query);

        return $this->ok($query->limit(500)->get());
    }

    public function storeAssignment(Request $request)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $this->companyId($request);

        $data = $request->validate([
            'employee_ids' => 'required|array|min:1|max:500',
            'employee_ids.*' => 'integer|distinct',
            'shift_id' => ['nullable', 'integer', Rule::exists('shifts', 'id')->where('company_id', $companyId)->where('is_active', true)],
            'shift_rotation_id' => ['nullable', 'integer', Rule::exists('shift_rotations', 'id')->where('company_id', $companyId)->where('is_active', true)],
            'rotation_anchor_date' => 'nullable|date',
            'starts_on' => 'required|date',
            'ends_on' => 'nullable|date|after_or_equal:starts_on',
            'notes' => 'nullable|string|max:255',
            'apply_to_past' => 'nullable|boolean',
        ]);
        if (empty($data['shift_id']) === empty($data['shift_rotation_id'])) {
            return $this->fail('Choose either a shift or a rotation.', 422, ['shift_id' => ['Choose either a shift or a rotation.']]);
        }
        $employeeIds = $this->companyEmployeeIds($request, $companyId, $data['employee_ids']);

        $result = $this->schedule->assign($companyId, $employeeIds, $data, $request->user()->id, (bool) ($data['apply_to_past'] ?? false));
        foreach ($result['assignments'] as $assignment) {
            app(ShiftNotificationService::class)->scheduleChanged(
                Employee::withoutGlobalScopes()->find($assignment->employee_id),
                'Your roster changed from ' . Carbon::parse($data['starts_on'])->toDateString() . '. Open My schedule to see your shifts.',
                $request->user()->id
            );
        }

        return $this->ok([
            'assignments' => $result['assignments'],
            'replaced' => $result['replaced'],
            'warnings' => $result['warnings'],
            'refreshed' => $result['refreshed'],
        ], 'Roster saved', 201);
    }

    public function updateAssignment(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $assignment = $this->findAssignment($request, $id);
        $data = $request->validate([
            'starts_on' => 'sometimes|date',
            'ends_on' => 'nullable|date',
            'notes' => 'nullable|string|max:255',
            'apply_to_past' => 'nullable|boolean',
        ]);
        $refreshed = $this->schedule->updateAssignment($assignment, $data, (bool) ($data['apply_to_past'] ?? false));

        return $this->ok(['assignment' => $assignment->fresh(), 'refreshed' => $refreshed], 'Roster updated');
    }

    public function destroyAssignment(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $assignment = $this->findAssignment($request, $id);
        $refreshed = $this->schedule->removeAssignment($assignment, $request->boolean('apply_to_past'));

        return $this->ok(['refreshed' => $refreshed], 'Roster entry removed');
    }

    private function findAssignment(Request $request, $id): ShiftAssignment
    {
        return ShiftAssignment::withoutGlobalScopes()->where('company_id', $this->companyId($request))->findOrFail($id);
    }

    // ── Overrides (single days) ────────────────────────────────────────────────

    public function overrides(Request $request)
    {
        $this->authorizeRosterView($request);
        $companyId = $this->companyId($request);
        [$from, $to] = $this->window($request, 31);

        $query = ShiftOverride::withoutGlobalScopes()->where('company_id', $companyId)
            ->with(['employee:id,name', 'shift:id,name'])
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])->orderBy('date');
        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->input('employee_id'));
        }
        $this->scopeEmployeeRelation($request, $query);

        return $this->ok($query->limit(1000)->get());
    }

    public function storeOverride(Request $request)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $this->companyId($request);

        $data = $request->validate([
            'employee_ids' => 'required|array|min:1|max:500',
            'employee_ids.*' => 'integer|distinct',
            'dates' => 'required|array|min:1|max:62',
            'dates.*' => 'date|distinct|after_or_equal:' . Carbon::today()->subDays(\App\Services\ShiftAttendanceSync::MAX_PAST_DAYS)->toDateString(),
            'shift_id' => ['nullable', 'integer', Rule::exists('shifts', 'id')->where('company_id', $companyId)->where('is_active', true)],
            'day_off' => 'nullable|boolean',
            'reason' => 'nullable|string|max:255',
        ]);
        $dayOff = (bool) ($data['day_off'] ?? false);
        if ($dayOff === !empty($data['shift_id'])) {
            return $this->fail('Choose a shift, or mark the day as a day off.', 422, ['shift_id' => ['Choose a shift, or mark the day as a day off.']]);
        }
        $employeeIds = $this->companyEmployeeIds($request, $companyId, $data['employee_ids']);
        if (count($employeeIds) * count($data['dates']) > self::MAX_CELLS) {
            return $this->fail('Too many days at once; split the change.', 422);
        }

        $dates = array_map(fn ($d) => Carbon::parse($d)->toDateString(), $data['dates']);
        $result = $this->schedule->override($companyId, $employeeIds, $dates, $dayOff ? null : (int) $data['shift_id'], $data['reason'] ?? null, $request->user()->id);

        foreach ($employeeIds as $employeeId) {
            app(ShiftNotificationService::class)->scheduleChanged(
                Employee::withoutGlobalScopes()->find($employeeId),
                ($dayOff ? 'You are off' : 'Your shift changed') . ' on ' . implode(', ', array_slice($dates, 0, 5)) . (count($dates) > 5 ? ' and more' : '') . '.',
                $request->user()->id
            );
        }

        return $this->ok($result, 'Schedule updated', 201);
    }

    public function destroyOverride(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $override = ShiftOverride::withoutGlobalScopes()->where('company_id', $this->companyId($request))->findOrFail($id);
        if ($override->type === ShiftOverride::TYPE_SWAP) {
            return $this->fail('This day comes from a shift swap. Cancel the swap instead.', 422);
        }

        return $this->ok(['refreshed' => $this->schedule->removeOverride($override)], 'Override removed');
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private function companyId(Request $request): string
    {
        $companyId = $request->user()?->company_id;
        abort_if(!$companyId, 403, 'Your account is not associated with a company.');

        return (string) $companyId;
    }

    /**
     * Ids that exist in this company and (for a line manager) inside their team.
     *
     * @return array<int>
     */
    private function companyEmployeeIds(Request $request, string $companyId, array $ids): array
    {
        $found = Employee::withoutGlobalScopes()->where('company_id', $companyId)->whereIn('id', $ids)->pluck('id')->map(fn ($i) => (int) $i)->all();
        if (count($found) !== count(array_unique($ids))) {
            abort(403, 'One or more employees do not belong to your company.');
        }
        foreach ($found as $id) {
            $this->authorizeManagedEmployeeAccess($request, $id, 'employee');
        }

        return $found;
    }

    private function scopeEmployeeRelation(Request $request, $query): void
    {
        $this->applyManagedEmployeeScope($request, $query, 'employee');
    }
}
