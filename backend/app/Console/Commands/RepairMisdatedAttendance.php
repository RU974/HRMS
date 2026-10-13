<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use Illuminate\Console\Command;

class RepairMisdatedAttendance extends Command
{
    protected $signature = 'attendance:repair-misdated {--apply : Write the changes (default is a dry run)}';

    protected $description = 'Fix biometric records whose date is later than the calendar day of their check-in (old timezone-shift bug)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $fixed = 0;

        Attendance::whereNotNull('check_in')
            ->whereRaw('DATE(check_in) < date')
            ->orderBy('date')
            ->get()
            ->each(function (Attendance $stale) use ($apply, &$fixed) {
                $correctDate = $stale->check_in->toDateString();
                $existing = Attendance::where('employee_id', $stale->employee_id)
                    ->whereDate('date', $correctDate)
                    ->where('id', '!=', $stale->id)
                    ->first();

                $this->line(sprintf('#%d employee %d: %s -> %s (%s)', $stale->id, $stale->employee_id,
                    $stale->date->toDateString(), $correctDate, $existing ? 'merge into #' . $existing->id : 'redate'));
                $fixed++;

                if (!$apply) {
                    return;
                }

                if ($existing) {
                    // Keep the existing day's real data; only fill what it lacks (e.g. an auto-absent row).
                    if (!$existing->check_in) {
                        $existing->check_in = $stale->check_in;
                        $existing->status = $stale->status;
                        $existing->source = $stale->source;
                        $existing->biometric_device_id = $stale->biometric_device_id;
                    }
                    if (!$existing->check_out && $stale->check_out) {
                        $existing->check_out = $stale->check_out;
                    }
                    $existing->save();
                    $stale->delete();
                } else {
                    $stale->date = $correctDate;
                    $stale->save();
                }
            });

        // Check-outs that precede their own check-in were copied from the previous night's punch.
        Attendance::whereNotNull('check_in')->whereNotNull('check_out')
            ->whereColumn('check_out', '<', 'check_in')
            ->get()
            ->each(function (Attendance $row) use ($apply, &$fixed) {
                $this->line(sprintf('#%d employee %d %s: clear check-out %s (before check-in)',
                    $row->id, $row->employee_id, $row->date->toDateString(), $row->check_out));
                $fixed++;
                if ($apply) {
                    $row->check_out = null;
                    $row->save();
                }
            });

        $this->info(($apply ? 'Repaired' : 'Would repair') . " {$fixed} record(s).");

        return self::SUCCESS;
    }
}
