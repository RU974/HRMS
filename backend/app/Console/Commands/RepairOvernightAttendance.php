<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use Carbon\Carbon;
use Illuminate\Console\Command;

class RepairOvernightAttendance extends Command
{
    protected $signature = 'attendance:repair-overnight {--apply : Write the changes (default is a dry run)}';

    protected $description = 'Re-attach night-shift check-outs that were stored on the wrong day or as a separate out-only record';

    private const MAX_SHIFT_HOURS = 20;

    public function handle(): int
    {
        return \App\Models\Attendance::recordingAs('repair', fn () => $this->repair(), 'Attendance repair command');
    }
    private function repair(): int
    {
        $apply = (bool) $this->option('apply');
        $fixed = 0;

        // 1. A check-out before its own check-in is the previous night's punch copied onto this
        //    day (not a real punch for this shift) - clear it so the real one can attach.
        Attendance::whereNotNull('check_in')->whereNotNull('check_out')
            ->whereColumn('check_out', '<', 'check_in')
            ->get()
            ->each(function (Attendance $row) use ($apply, &$fixed) {
                if ($this->closed($row)) {
                    return;
                }
                $this->line(sprintf('#%d employee %d %s: clear check-out %s (before check-in)',
                    $row->id, $row->employee_id, $row->date->toDateString(), $row->check_out));
                $fixed++;
                if ($apply) {
                    $row->check_out = null;
                    $row->save();
                }
            });

        // 2. Out-only record (no check-in): its punch is the real check-out of the evening
        //    shift that started the day before. It replaces an empty or wrong check-out
        //    (e.g. a copied punch left on the same morning).
        Attendance::whereNull('check_in')->whereNotNull('check_out')
            ->orderBy('date')
            ->get()
            ->each(function (Attendance $orphan) use ($apply, &$fixed) {
                $out = Carbon::parse($orphan->check_out);

                $target = Attendance::where('employee_id', $orphan->employee_id)
                    ->where('id', '!=', $orphan->id)
                    ->whereNotNull('check_in')
                    ->where('check_in', '>=', $out->copy()->subHours(self::MAX_SHIFT_HOURS))
                    ->where('check_in', '<', $out)
                    ->orderByDesc('check_in')
                    ->first();

                if ($this->closed($orphan, $target)) {
                    return;
                }

                if (!$target) {
                    $this->moveOrphanToShiftDay($orphan, $out, $apply, $fixed);

                    return;
                }

                $existing = $target->check_out ? Carbon::parse($target->check_out) : null;
                if ($existing && $existing->gte($target->check_in) && $existing->toDateString() !== $orphan->date->toDateString()) {
                    return; // closed on another day: a different shift's check-out, leave it alone
                }
                if ($existing && $existing->gte($target->check_in)) {
                    // The shift is already closed: the out-only row is a repeated or later punch of the
                    // same morning. Keep the latest as the check-out and drop the duplicate row.
                    $this->line(sprintf('#%d employee %d: duplicate out-only %s -> folded into #%d (%s, check-out %s)', $orphan->id,
                        $orphan->employee_id, $out, $target->id, $target->date->toDateString(), $existing->max($out)));
                    $fixed++;
                    if ($apply) {
                        if ($out->gt($existing)) {
                            $target->check_out = $out;
                            $target->save();
                        }
                        $orphan->delete();
                    }

                    return;
                }

                $this->line(sprintf('#%d employee %d: out-only %s -> check-out of #%d (%s, was %s)', $orphan->id,
                    $orphan->employee_id, $out, $target->id, $target->date->toDateString(), $existing ?? 'empty'));
                $fixed++;
                if ($apply) {
                    $target->check_out = $out;
                    $target->save();
                    $orphan->delete();
                }
            });

        $this->info(($apply ? 'Repaired' : 'Would repair') . " {$fixed} record(s).");

        return self::SUCCESS;
    }

    /**
     * A morning check-out with no evening check-in anywhere: file it on the shift's start date
     * (the day before) and flag it, instead of leaving a "present" row on the wrong day.
     */
    private function moveOrphanToShiftDay(Attendance $orphan, Carbon $out, bool $apply, int &$fixed): void
    {
        if ((int) $out->format('G') >= 12 || $orphan->status === Attendance::STATUS_MISSING_CHECK_IN && $orphan->date->toDateString() < $out->toDateString()) {
            return; // not a morning punch, or already filed on the previous day
        }

        $previousDate = $out->copy()->subDay()->toDateString();
        $previous = Attendance::where('employee_id', $orphan->employee_id)
            ->whereDate('date', $previousDate)
            ->first();

        // The previous day may only hold an empty (e.g. auto-marked absent) row; anything real is left alone.
        if ($previous && ($previous->check_in || $previous->check_out)) {
            return;
        }
        // The row moves to the previous day, so that day's month must be open too.
        $moved = $orphan->replicate();
        $moved->id = $orphan->id;
        $moved->date = $previousDate;
        if ($this->closed($moved, $previous)) {
            return;
        }

        $note = 'Check-in missing: only a check-out punch (' . $out->format('H:i') . ') was recorded.';
        $this->line(sprintf('#%d employee %d: out-only %s -> %s as missing check-in%s', $orphan->id,
            $orphan->employee_id, $out, $previousDate, $previous ? " (replacing empty #{$previous->id})" : ''));
        $fixed++;
        if (!$apply) {
            return;
        }

        $previous?->delete();
        $orphan->date = $previousDate;
        $orphan->status = Attendance::STATUS_MISSING_CHECK_IN;
        $orphan->notes = $note;
        $orphan->save();
    }
    /** True (and reported) when any of these rows sits in a closed month: a repair must not rewrite it. */
    private function closed(?\App\Models\Attendance ...$rows): bool
    {
        $guard = app(\App\Services\AttendancePeriodGuard::class);
        foreach ($rows as $row) {
            if ($row && $guard->lockFor((int) $row->employee_id, $row->date)) {
                $this->warn(sprintf('#%d employee %d %s: skipped (period closed)', $row->id, $row->employee_id, $row->date->toDateString()));

                return true;
            }
        }

        return false;
    }
}
