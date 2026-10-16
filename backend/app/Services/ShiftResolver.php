<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Shift;
use App\Models\ShiftAssignment;
use App\Models\ShiftOverride;
use App\Models\ShiftRotation;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * The single place that answers "which shift is this person on, on this date?".
 *
 * Precedence, most specific first:
 *   1. a per-date override (one-off change, day off, or the result of an approved swap)
 *   2. a roster assignment covering the date (a fixed shift, or a rotation that cycles from an anchor date)
 *   3. the employee's default shift
 *
 * A date with no shift at all falls back to Monday-Friday working days, as before.
 * Registered as a singleton, so the small caches live for one request / one test; model events call flush().
 */
class ShiftResolver
{
    /** Used when the employee has no shift, or the shift predates working_days. */
    public const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

    /** @var array<int, Collection<int, ShiftAssignment>> employee_id => assignments */
    private array $assignments = [];

    /** @var array<string, array<string, ShiftOverride>> "employee|Y-m" => date => override */
    private array $overrides = [];

    /** @var array<int, Shift|null> */
    private array $shifts = [];

    /** @var array<int, array<int, int|null>> rotation_id => position => shift_id */
    private array $rotations = [];

    public function flush(): void
    {
        $this->assignments = $this->overrides = $this->shifts = $this->rotations = [];
    }

    public function on(Employee $employee, CarbonInterface|string $date): ScheduledShift
    {
        $day = Carbon::parse($date)->startOfDay();
        $key = $day->toDateString();

        $override = $this->overridesFor((int) $employee->id, $day)[$key] ?? null;
        if ($override) {
            $shift = $override->shift_id ? $this->shiftFor((int) $override->shift_id, $employee) : null;

            return new ScheduledShift($shift, $shift !== null, $override->type === ShiftOverride::TYPE_SWAP ? ScheduledShift::SOURCE_SWAP : ScheduledShift::SOURCE_OVERRIDE, (int) $override->id);
        }

        $assignment = $this->assignmentFor($employee, $day);
        if ($assignment) {
            if ($assignment->shift_rotation_id) {
                $slots = $this->rotationSlots((int) $assignment->shift_rotation_id);
                if ($slots !== []) {
                    $anchor = Carbon::parse($assignment->rotation_anchor_date ?? $assignment->starts_on)->startOfDay();
                    $offset = (int) $anchor->diffInDays($day, false);
                    $shiftId = $slots[(($offset % count($slots)) + count($slots)) % count($slots)];
                    $shift = $shiftId ? $this->shiftFor((int) $shiftId, $employee) : null;

                    return new ScheduledShift($shift, $shift !== null, ScheduledShift::SOURCE_ROTATION, (int) $assignment->id);
                }
            } elseif ($assignment->shift_id) {
                $shift = $this->shiftFor((int) $assignment->shift_id, $employee);
                if ($shift) {
                    return new ScheduledShift($shift, $this->worksOn($shift, $day), ScheduledShift::SOURCE_ROSTER, (int) $assignment->id);
                }
            }
        }

        if ($employee->shift_id) {
            $shift = $this->shiftFor((int) $employee->shift_id, $employee);
            if ($shift) {
                return new ScheduledShift($shift, $this->worksOn($shift, $day), ScheduledShift::SOURCE_DEFAULT);
            }
        }

        return new ScheduledShift(null, in_array($day->dayOfWeekIso, self::DEFAULT_WORKING_DAYS, true), ScheduledShift::SOURCE_NONE);
    }

    /** @return array<string, ScheduledShift> Y-m-d => schedule */
    public function range(Employee $employee, CarbonInterface|string $from, CarbonInterface|string $to): array
    {
        $out = [];
        $to = Carbon::parse($to)->startOfDay();
        for ($day = Carbon::parse($from)->startOfDay(); $day->lte($to); $day->addDay()) {
            $out[$day->toDateString()] = $this->on($employee, $day);
        }

        return $out;
    }

    public function isWorkingDay(Employee $employee, CarbonInterface|string $date): bool
    {
        return $this->on($employee, $date)->isWorkingDay;
    }

    /** Load assignments and overrides for many employees in one go (bulk jobs); later on() calls hit the cache. */
    public function preload(Collection $employees, CarbonInterface|string $from, CarbonInterface|string $to): void
    {
        $ids = $employees->pluck('id')->map(fn ($id) => (int) $id)->unique()->values();
        if ($ids->isEmpty()) {
            return;
        }

        $missing = $ids->reject(fn ($id) => isset($this->assignments[$id]))->all();
        if ($missing) {
            $grouped = ShiftAssignment::withoutGlobalScopes()->whereIn('employee_id', $missing)->orderBy('starts_on')->get()->groupBy('employee_id');
            foreach ($missing as $id) {
                $this->assignments[$id] = $grouped->get($id, collect());
            }
        }

        $start = Carbon::parse($from)->startOfMonth();
        $end = Carbon::parse($to)->startOfMonth();
        for ($month = $start->copy(); $month->lte($end); $month->addMonth()) {
            $pending = $ids->reject(fn ($id) => isset($this->overrides[$id . '|' . $month->format('Y-m')]))->all();
            if (!$pending) {
                continue;
            }
            $found = ShiftOverride::withoutGlobalScopes()
                ->whereIn('employee_id', $pending)
                ->whereBetween('date', [$month->toDateString(), $month->copy()->endOfMonth()->toDateString()])
                ->get()->groupBy('employee_id');
            foreach ($pending as $id) {
                $this->overrides[$id . '|' . $month->format('Y-m')] = $found->get($id, collect())
                    ->keyBy(fn ($o) => Carbon::parse($o->date)->toDateString())->all();
            }
        }
    }

    private function worksOn(Shift $shift, Carbon $day): bool
    {
        $days = is_array($shift->working_days) && $shift->working_days !== []
            ? array_map('intval', $shift->working_days)
            : self::DEFAULT_WORKING_DAYS;

        return in_array($day->dayOfWeekIso, $days, true);
    }

    /** @return array<string, ShiftOverride> */
    private function overridesFor(int $employeeId, Carbon $day): array
    {
        $key = $employeeId . '|' . $day->format('Y-m');

        return $this->overrides[$key] ??= ShiftOverride::withoutGlobalScopes()
            ->where('employee_id', $employeeId)
            ->whereBetween('date', [$day->copy()->startOfMonth()->toDateString(), $day->copy()->endOfMonth()->toDateString()])
            ->get()
            ->keyBy(fn ($o) => Carbon::parse($o->date)->toDateString())
            ->all();
    }

    private function assignmentFor(Employee $employee, Carbon $day): ?ShiftAssignment
    {
        $all = $this->assignments[(int) $employee->id] ??= ShiftAssignment::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->orderBy('starts_on')->get();
        $date = $day->toDateString();

        // Assignments never overlap; if bad data has two, the one that started last wins.
        return $all->filter(fn (ShiftAssignment $a) => Carbon::parse($a->starts_on)->toDateString() <= $date
            && ($a->ends_on === null || Carbon::parse($a->ends_on)->toDateString() >= $date))
            ->sortByDesc(fn ($a) => Carbon::parse($a->starts_on)->toDateString())
            ->first();
    }

    /** @return array<int, int|null> */
    private function rotationSlots(int $rotationId): array
    {
        return $this->rotations[$rotationId] ??= ShiftRotation::withoutGlobalScopes()->find($rotationId)
            ?->slots()->get()->pluck('shift_id', 'position')->sortKeys()->values()->all() ?? [];
    }

    /** The shift with grace_minutes resolved for the employee's department (an in-memory copy). */
    private function shiftFor(int $shiftId, Employee $employee): ?Shift
    {
        if (!array_key_exists($shiftId, $this->shifts)) {
            $this->shifts[$shiftId] = Shift::withoutGlobalScopes()->with('departmentGraces')->find($shiftId);
        }
        $shift = $this->shifts[$shiftId];
        if (!$shift) {
            return null;
        }

        $effective = clone $shift;
        $effective->grace_minutes = $shift->graceMinutesFor($employee->department_id ? (int) $employee->department_id : null);

        return $effective;
    }
}
