<?php

namespace App\Console\Commands;

use App\Services\AttendanceStatusRecalculator;
use Carbon\Carbon;
use Illuminate\Console\Command;

class RecalculateAttendanceStatus extends Command
{
    protected $signature = 'attendance:recalculate-status {--from= : First date (default 31 days ago)} {--to= : Last date} {--shift= : Only this shift id} {--apply : Write the changes (default is a dry run)}';

    protected $description = 'Re-derive present/late status from check-in times using the current shift and department grace periods';

    public function handle(AttendanceStatusRecalculator $recalculator): int
    {
        $apply = (bool) $this->option('apply');
        $from  = $this->option('from') ? Carbon::parse($this->option('from')) : Carbon::today()->subDays(31);
        $to    = $this->option('to') ? Carbon::parse($this->option('to')) : null;

        $changed = $recalculator->recalculate(
            $from,
            $to,
            $this->option('shift') ? (int) $this->option('shift') : null,
            $apply,
            fn ($record, $status) => $this->line(sprintf('#%d employee %d %s: %s -> %s',
                $record->id, $record->employee_id, $record->date->toDateString(), $record->status, $status))
        );

        $this->info(($apply ? 'Updated' : 'Would update') . " {$changed} record(s).");

        return self::SUCCESS;
    }
}
