<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\ShiftAssignment;
use App\Models\ShiftOverride;
use App\Models\ShiftRotation;
use App\Models\ShiftSwap;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Writes to the schedule: roster assignments, one-day overrides and swaps. Every write keeps the
 * attendance records of the affected dates in step (see ShiftAttendanceSync) and reports warnings
 * (rest time, leave, holiday) instead of silently producing a bad rota.
 */
class ShiftScheduleService
{
    /** Shortest comfortable gap between the end of one shift and the start of the next. */
    public const MIN_REST_HOURS = 8;

    /** Furthest a swap may be requested ahead of today. */
    public const MAX_SWAP_DAYS_AHEAD = 90;

    public function __construct(
        private ShiftResolver $resolver,
        private ShiftAttendanceSync $sync,
        private ShiftNotificationService $notify,
    ) {
    }

    // ── Roster assignments ─────────────────────────────────────────────────────

    /**
     * Give employees a shift or rotation from a date (optionally to a date). Overlapping assignments are
     * trimmed or split so every day has exactly one.
     *
     * @param  array<int>  $employeeIds  already checked to belong to the company
     * @param  array{shift_id?: ?int, shift_rotation_id?: ?int, rotation_anchor_date?: ?string, starts_on: string, ends_on?: ?string, notes?: ?string}  $data
     * @return array{assignments: array<int, ShiftAssignment>, replaced: int, warnings: array<int, string>, refreshed: array}
     */
    public function assign(string $companyId, array $employeeIds, array $data, ?int $userId, bool $applyToPast = false): array
    {
        $start = Carbon::parse($data['starts_on'])->startOfDay();
        $end = !empty($data['ends_on']) ? Carbon::parse($data['ends_on'])->startOfDay() : null;
        $replaced = 0;
        $created = [];
        $warnings = [];

        DB::transaction(function () use ($companyId, $employeeIds, $data, $userId, $start, $end, &$replaced, &$created, &$warnings) {
            foreach (Employee::withoutGlobalScopes()->where('company_id', $companyId)->whereIn('id', $employeeIds)->get() as $employee) {
                $replaced += $this->trimOverlaps((int) $employee->id, $start, $end);

                $created[] = ShiftAssignment::create([
                    'company_id' => $companyId,
                    'employee_id' => $employee->id,
                    'shift_id' => $data['shift_id'] ?? null,
                    'shift_rotation_id' => $data['shift_rotation_id'] ?? null,
                    // The phase of a rotation is fixed by an explicit date, so trimming never shifts it.
                    'rotation_anchor_date' => !empty($data['shift_rotation_id']) ? ($data['rotation_anchor_date'] ?? $start->toDateString()) : null,
                    'starts_on' => $start->toDateString(),
                    'ends_on' => $end?->toDateString(),
                    'notes' => $data['notes'] ?? null,
                    'created_by' => $userId,
                ]);

                if ($employee->joining_date && Carbon::parse($employee->joining_date)->gt($start)) {
                    $warnings[] = "{$employee->name} joins on " . Carbon::parse($employee->joining_date)->toDateString() . ', after the roster starts.';
                }
                if ($employee->status !== 'active') {
                    $warnings[] = "{$employee->name} is not an active employee.";
                }
            }
        });

        $from = $applyToPast ? $start : $start->copy()->max(Carbon::today());
        $refreshed = $this->sync->refresh($employeeIds, $from, $end);

        return ['assignments' => $created, 'replaced' => $replaced, 'warnings' => array_values(array_unique($warnings)), 'refreshed' => $refreshed];
    }

    /** Make room for a new assignment on [start, end]; returns how many existing ones were touched. */
    private function trimOverlaps(int $employeeId, Carbon $start, ?Carbon $end): int
    {
        $touched = 0;
        $overlapping = ShiftAssignment::withoutGlobalScopes()
            ->where('employee_id', $employeeId)
            ->when($end, fn ($q) => $q->whereDate('starts_on', '<=', $end->toDateString()))
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $start->toDateString()))
            ->get();

        foreach ($overlapping as $existing) {
            $existingStart = Carbon::parse($existing->starts_on)->startOfDay();
            $existingEnd = $existing->ends_on ? Carbon::parse($existing->ends_on)->startOfDay() : null;
            $keepsLeft = $existingStart->lt($start);
            $keepsRight = $end !== null && ($existingEnd === null || $existingEnd->gt($end));
            $touched++;

            if ($keepsLeft && $keepsRight) {
                $tail = $existing->replicate();
                $tail->starts_on = $end->copy()->addDay()->toDateString();
                $tail->rotation_anchor_date ??= $existing->starts_on;
                $tail->save();
                $existing->update(['ends_on' => $start->copy()->subDay()->toDateString()]);
            } elseif ($keepsLeft) {
                $existing->update(['ends_on' => $start->copy()->subDay()->toDateString()]);
            } elseif ($keepsRight) {
                $existing->update([
                    'rotation_anchor_date' => $existing->shift_rotation_id ? ($existing->rotation_anchor_date ?? $existing->starts_on) : null,
                    'starts_on' => $end->copy()->addDay()->toDateString(),
                ]);
            } else {
                $existing->delete();
            }
        }

        return $touched;
    }

    /** End or move an assignment; the records of the dates it stops covering are re-judged from today (or $applyToPast). */
    public function removeAssignment(ShiftAssignment $assignment, bool $applyToPast = false): array
    {
        $start = Carbon::parse($assignment->starts_on)->startOfDay();
        $end = $assignment->ends_on ? Carbon::parse($assignment->ends_on)->startOfDay() : null;
        $employeeId = (int) $assignment->employee_id;
        $assignment->delete();

        return $this->sync->refresh([$employeeId], $applyToPast ? $start : $start->copy()->max(Carbon::today()), $end);
    }

    /**
     * Change the end date / notes of an assignment. Ending it earlier hands the freed days back to
     * whatever was underneath (the employee's default shift).
     */
    public function updateAssignment(ShiftAssignment $assignment, array $data, bool $applyToPast = false): array
    {
        $oldEnd = $assignment->ends_on ? Carbon::parse($assignment->ends_on)->startOfDay() : null;
        $oldStart = Carbon::parse($assignment->starts_on)->startOfDay();
        $newStart = isset($data['starts_on']) ? Carbon::parse($data['starts_on'])->startOfDay() : $oldStart;
        $newEnd = array_key_exists('ends_on', $data) ? ($data['ends_on'] ? Carbon::parse($data['ends_on'])->startOfDay() : null) : $oldEnd;

        if ($newEnd && $newEnd->lt($newStart)) {
            throw ValidationException::withMessages(['ends_on' => 'The end date cannot be before the start date.']);
        }

        $clash = ShiftAssignment::withoutGlobalScopes()
            ->where('employee_id', $assignment->employee_id)
            ->whereKeyNot($assignment->id)
            ->when($newEnd, fn ($q) => $q->whereDate('starts_on', '<=', $newEnd->toDateString()))
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $newStart->toDateString()))
            ->exists();
        if ($clash) {
            throw ValidationException::withMessages(['starts_on' => 'These dates overlap another assignment of the same employee.']);
        }

        // A rotation keeps its phase when the start date moves.
        if ($assignment->shift_rotation_id && !$assignment->rotation_anchor_date) {
            $assignment->rotation_anchor_date = $oldStart->toDateString();
        }
        $assignment->fill([
            'starts_on' => $newStart->toDateString(),
            'ends_on' => $newEnd?->toDateString(),
            'notes' => array_key_exists('notes', $data) ? $data['notes'] : $assignment->notes,
        ])->save();

        $from = $oldStart->copy()->min($newStart);
        $to = ($oldEnd === null || $newEnd === null) ? null : $oldEnd->copy()->max($newEnd);

        return $this->sync->refresh([(int) $assignment->employee_id], $applyToPast ? $from : $from->copy()->max(Carbon::today()), $to);
    }

    // ── One-day overrides ──────────────────────────────────────────────────────

    /**
     * Put employees on a different shift (or off) on specific dates.
     *
     * @param  array<int>     $employeeIds
     * @param  array<string>  $dates       Y-m-d
     * @return array{saved: int, skipped: array<int, string>, warnings: array<int, string>, refreshed: array}
     */
    public function override(string $companyId, array $employeeIds, array $dates, ?int $shiftId, ?string $reason, ?int $userId): array
    {
        $saved = 0;
        $skipped = [];
        $warnings = [];
        $touched = [];

        DB::transaction(function () use ($companyId, $employeeIds, $dates, $shiftId, $reason, $userId, &$saved, &$skipped, &$warnings, &$touched) {
            foreach (Employee::withoutGlobalScopes()->where('company_id', $companyId)->whereIn('id', $employeeIds)->get() as $employee) {
                foreach ($dates as $date) {
                    $existing = ShiftOverride::withoutGlobalScopes()->where('employee_id', $employee->id)->whereDate('date', $date)->first();
                    if ($existing && $existing->type === ShiftOverride::TYPE_SWAP) {
                        $skipped[] = "{$employee->name} on {$date} is part of a shift swap; cancel the swap to change it.";
                        continue;
                    }

                    ShiftOverride::withoutGlobalScopes()->updateOrCreate(
                        ['employee_id' => $employee->id, 'date' => $date],
                        ['company_id' => $companyId, 'shift_id' => $shiftId, 'type' => ShiftOverride::TYPE_OVERRIDE, 'shift_swap_id' => null, 'reason' => $reason, 'created_by' => $userId]
                    );
                    $saved++;
                    $touched[(int) $employee->id][] = $date;
                }
            }
        });

        $this->resolver->flush();
        foreach ($touched as $employeeId => $employeeDates) {
            $employee = Employee::withoutGlobalScopes()->find($employeeId);
            foreach ($employeeDates as $date) {
                array_push($warnings, ...$this->warnings($employee, $date));
            }
        }

        // An override is about specific days, so it re-judges them even when they are in the past.
        $refreshed = ['snapshots' => 0, 'removed' => 0, 'statuses' => 0, 'absences' => 0];
        foreach ($touched as $employeeId => $employeeDates) {
            sort($employeeDates);
            $r = $this->sync->refresh([$employeeId], Carbon::parse($employeeDates[0]), Carbon::parse(end($employeeDates)));
            foreach ($r as $k => $v) {
                $refreshed[$k] += $v;
            }
        }

        return ['saved' => $saved, 'skipped' => $skipped, 'warnings' => array_values(array_unique($warnings)), 'refreshed' => $refreshed];
    }

    public function removeOverride(ShiftOverride $override): array
    {
        $employeeId = (int) $override->employee_id;
        $date = Carbon::parse($override->date)->startOfDay();
        $override->delete();

        return $this->sync->refresh([$employeeId], $date, $date);
    }

    // ── Swaps ──────────────────────────────────────────────────────────────────

    /**
     * Why a swap cannot happen, or an empty list. Used when it is requested and again when it is approved.
     *
     * @return array<int, string>
     */
    public function swapProblems(Employee $requester, Employee $counterpart, Carbon $requesterDate, Carbon $counterpartDate, ?int $ignoreSwapId = null): array
    {
        $problems = [];
        $today = Carbon::today();

        if ($requester->id === $counterpart->id) {
            return ['You cannot swap with yourself.'];
        }
        if ((string) $requester->company_id !== (string) $counterpart->company_id) {
            return ['Both people must work for the same company.'];
        }
        foreach ([$requesterDate, $counterpartDate] as $date) {
            if ($date->lt($today)) {
                $problems[] = 'A swap cannot be for a day that has already passed.';
                break;
            }
            if ($date->gt($today->copy()->addDays(self::MAX_SWAP_DAYS_AHEAD))) {
                $problems[] = 'A swap can be at most ' . self::MAX_SWAP_DAYS_AHEAD . ' days ahead.';
                break;
            }
        }
        if ($problems) {
            return $problems;
        }

        $this->resolver->flush();
        $mine = $this->resolver->on($requester, $requesterDate);
        $theirs = $this->resolver->on($counterpart, $counterpartDate);

        if (!$mine->isWorkingDay || !$mine->shift) {
            $problems[] = "{$requester->name} is not scheduled to work on {$requesterDate->toDateString()}.";
        }
        if (!$theirs->isWorkingDay || !$theirs->shift) {
            $problems[] = "{$counterpart->name} is not scheduled to work on {$counterpartDate->toDateString()}.";
        }

        if ($requesterDate->isSameDay($counterpartDate)) {
            if ($mine->shift && $theirs->shift && $mine->shift->id === $theirs->shift->id) {
                $problems[] = 'Both people are already on the same shift that day.';
            }
        } else {
            // Cover swap: each person works the other's day, so they must be free on it.
            if ($this->resolver->on($counterpart, $requesterDate)->isWorkingDay) {
                $problems[] = "{$counterpart->name} is already working on {$requesterDate->toDateString()}.";
            }
            if ($this->resolver->on($requester, $counterpartDate)->isWorkingDay) {
                $problems[] = "{$requester->name} is already working on {$counterpartDate->toDateString()}.";
            }
        }

        foreach ([[$requester, [$requesterDate, $counterpartDate]], [$counterpart, [$requesterDate, $counterpartDate]]] as [$employee, $dates]) {
            foreach ($dates as $date) {
                if ($this->onLeave($employee, $date)) {
                    $problems[] = "{$employee->name} has approved leave on {$date->toDateString()}.";
                }
                if (ShiftOverride::withoutGlobalScopes()->where('employee_id', $employee->id)->whereDate('date', $date)
                    ->where('type', ShiftOverride::TYPE_SWAP)->when($ignoreSwapId, fn ($q) => $q->where('shift_swap_id', '!=', $ignoreSwapId))->exists()) {
                    $problems[] = "{$employee->name} is already part of another swap on {$date->toDateString()}.";
                }
            }
        }

        $open = ShiftSwap::withoutGlobalScopes()->whereIn('status', [ShiftSwap::PENDING_PEER, ShiftSwap::PENDING_APPROVAL])
            ->when($ignoreSwapId, fn ($q) => $q->whereKeyNot($ignoreSwapId))
            ->where(function ($q) use ($requester, $counterpart, $requesterDate, $counterpartDate) {
                $q->where(fn ($w) => $w->whereIn('requester_id', [$requester->id, $counterpart->id])
                    ->whereIn('requester_date', [$requesterDate->toDateString(), $counterpartDate->toDateString()]))
                    ->orWhere(fn ($w) => $w->whereIn('counterpart_id', [$requester->id, $counterpart->id])
                        ->whereIn('counterpart_date', [$requesterDate->toDateString(), $counterpartDate->toDateString()]));
            })->exists();
        if ($open) {
            $problems[] = 'One of them already has a pending swap request for those days.';
        }

        return array_values(array_unique($problems));
    }

    /** Make an approved swap real: the schedule of both people changes for the dates involved. */
    public function applySwap(ShiftSwap $swap): array
    {
        $a = Employee::withoutGlobalScopes()->findOrFail($swap->requester_id);
        $b = Employee::withoutGlobalScopes()->findOrFail($swap->counterpart_id);
        $dateA = Carbon::parse($swap->requester_date)->startOfDay();
        $dateB = Carbon::parse($swap->counterpart_date)->startOfDay();

        $this->resolver->flush();
        $aShiftA = $this->resolver->on($a, $dateA)->shift; // what A was due to do on A's day
        $bShiftB = $this->resolver->on($b, $dateB)->shift;

        DB::transaction(function () use ($swap, $a, $b, $dateA, $dateB, $aShiftA, $bShiftB) {
            $write = fn (Employee $employee, Carbon $date, ?int $shiftId) => ShiftOverride::withoutGlobalScopes()->updateOrCreate(
                ['employee_id' => $employee->id, 'date' => $date->toDateString()],
                ['company_id' => $employee->company_id, 'shift_id' => $shiftId, 'type' => ShiftOverride::TYPE_SWAP, 'shift_swap_id' => $swap->id, 'reason' => $swap->reason, 'created_by' => $swap->decided_by]
            );

            if ($dateA->isSameDay($dateB)) {
                $write($a, $dateA, $bShiftB?->id);
                $write($b, $dateB, $aShiftA?->id);
            } else {
                $write($a, $dateA, null);              // A is off on A's day ...
                $write($b, $dateA, $aShiftA?->id);     // ... and B covers it
                $write($b, $dateB, null);              // B is off on B's day ...
                $write($a, $dateB, $bShiftB?->id);     // ... and A covers it
            }
        });

        $this->resolver->flush();

        return $this->refreshSwap($swap);
    }

    /** Take a swap's overrides away again (the swap was cancelled after approval). */
    public function releaseSwap(ShiftSwap $swap): array
    {
        ShiftOverride::withoutGlobalScopes()->where('shift_swap_id', $swap->id)->delete();
        $this->resolver->flush();

        return $this->refreshSwap($swap);
    }

    private function refreshSwap(ShiftSwap $swap): array
    {
        $from = Carbon::parse($swap->requester_date)->min(Carbon::parse($swap->counterpart_date));
        $to = Carbon::parse($swap->requester_date)->max(Carbon::parse($swap->counterpart_date));

        return $this->sync->refresh([(int) $swap->requester_id, (int) $swap->counterpart_id], $from, $to);
    }

    // ── Warnings ───────────────────────────────────────────────────────────────

    /** @return array<int, string> things worth a second look about this person's day (never blocking) */
    public function warnings(?Employee $employee, string $date): array
    {
        if (!$employee) {
            return [];
        }

        $day = Carbon::parse($date)->startOfDay();
        $out = [];

        if ($this->onLeave($employee, $day)) {
            $out[] = "{$employee->name} has approved leave on {$day->toDateString()}.";
        }
        if (Holiday::withoutGlobalScopes()->where('company_id', $employee->company_id)->where('is_optional', false)->whereDate('holiday_date', $day->toDateString())->exists()) {
            $out[] = "{$day->toDateString()} is a company holiday.";
        }
        if ($employee->joining_date && Carbon::parse($employee->joining_date)->gt($day)) {
            $out[] = "{$employee->name} had not joined yet on {$day->toDateString()}.";
        }

        $today = $this->resolver->on($employee, $day);
        $before = $this->resolver->on($employee, $day->copy()->subDay());
        $after = $this->resolver->on($employee, $day->copy()->addDay());

        if ($today->shift && $before->shift) {
            $gap = $this->hoursBetween($this->endOf($before->shift, $day->copy()->subDay()), $this->startOf($today->shift, $day));
            if ($gap < self::MIN_REST_HOURS) {
                $out[] = sprintf('%s would have only %s hours of rest before the shift on %s.', $employee->name, rtrim(rtrim(number_format($gap, 1), '0'), '.'), $day->toDateString());
            }
        }
        if ($today->shift && $after->shift) {
            $gap = $this->hoursBetween($this->endOf($today->shift, $day), $this->startOf($after->shift, $day->copy()->addDay()));
            if ($gap < self::MIN_REST_HOURS) {
                $out[] = sprintf('%s would have only %s hours of rest after the shift on %s.', $employee->name, rtrim(rtrim(number_format($gap, 1), '0'), '.'), $day->toDateString());
            }
        }

        return $out;
    }

    private function startOf(\App\Models\Shift $shift, Carbon $day): Carbon
    {
        return Carbon::parse($day->toDateString() . ' ' . $shift->start_time);
    }

    private function endOf(\App\Models\Shift $shift, Carbon $day): Carbon
    {
        $end = Carbon::parse($day->toDateString() . ' ' . $shift->end_time);
        if ($shift->continues_after_midnight || $end->lessThanOrEqualTo($this->startOf($shift, $day))) {
            $end->addDay();
        }

        return $end;
    }

    private function hoursBetween(Carbon $from, Carbon $to): float
    {
        return ($to->getTimestamp() - $from->getTimestamp()) / 3600.0;
    }

    private function onLeave(Employee $employee, Carbon $day): bool
    {
        return Leave::query()->where('employee_id', $employee->id)->where('status', 'approved')
            ->whereDate('from_date', '<=', $day->toDateString())->whereDate('to_date', '>=', $day->toDateString())->exists();
    }

    /** Employees whose rotation changed: re-judge from today. */
    public function rotationChanged(ShiftRotation $rotation): array
    {
        $employeeIds = ShiftAssignment::withoutGlobalScopes()->where('shift_rotation_id', $rotation->id)->pluck('employee_id')->unique()->map(fn ($id) => (int) $id)->all();
        $this->resolver->flush();

        return $employeeIds ? $this->sync->refresh($employeeIds, Carbon::today()) : [];
    }
}
