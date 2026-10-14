<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use Carbon\Carbon;
use Illuminate\Console\Command;

class RepairOvernightAttendance extends Command
{
    protected $signature = 'attendance:repair-overnight {--apply : Write the changes (default is a dry run)}';

    protected $description = 'Re-attach night-shift check-outs that were stored before their check-in or as a separate out-only record';

    private const MAX_SHIFT_HOURS = 20;

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $fixed = 0;

        // 1. Check-out stored on the shift-start day (e.g. in 20:11, out 05:11 same date): roll it to the next day.
        Attendance::whereNotNull('check_in')->whereNotNull('check_out')
            ->whereColumn('check_out', '<', 'check_in')
            ->get()
            ->each(function (Attendance $row) use ($apply, &$fixed) {
                $out = Carbon::parse($row->check_out)->addDay();
                if ($out->getTimestamp() - Carbon::parse($row->check_in)->getTimestamp() > self::MAX_SHIFT_HOURS * 3600) {
                    return;
                }
                $this->line(sprintf('#%d employee %d %s: check-out %s -> %s', $row->id, $row->employee_id,
                    $row->date->toDateString(), $row->check_out, $out));
                $fixed++;
                if ($apply) {
                    $row->check_out = $out;
                    $row->save();
                }
            });

        // 2. Out-only record (no check-in) whose punch closes the previous evening's open record.
        Attendance::whereNull('check_in')->whereNotNull('check_out')
            ->orderBy('date')
            ->get()
            ->each(function (Attendance $orphan) use ($apply, &$fixed) {
                $out = Carbon::parse($orphan->check_out);
                $open = Attendance::where('employee_id', $orphan->employee_id)
                    ->where('id', '!=', $orphan->id)
                    ->whereNotNull('check_in')
                    ->whereNull('check_out')
                    ->where('check_in', '>=', $out->copy()->subHours(self::MAX_SHIFT_HOURS))
                    ->where('check_in', '<', $out)
                    ->orderByDesc('check_in')
                    ->first();

                if (!$open) {
                    return;
                }

                $this->line(sprintf('#%d employee %d: out-only %s -> check-out of #%d (%s)', $orphan->id,
                    $orphan->employee_id, $out, $open->id, $open->date->toDateString()));
                $fixed++;
                if ($apply) {
                    $open->check_out = $out;
                    $open->save();
                    $orphan->delete();
                }
            });

        $this->info(($apply ? 'Repaired' : 'Would repair') . " {$fixed} record(s).");

        return self::SUCCESS;
    }
}
