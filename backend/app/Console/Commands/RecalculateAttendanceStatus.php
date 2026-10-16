<?php

namespace App\Console\Commands;

use App\Services\AttendanceStatusRecalculator;
use Carbon\Carbon;
use Illuminate\Console\Command;

class RecalculateAttendanceStatus extends Command
{
    protected $signature = 'attendance:recalculate-status {--from= : First date (default 31 days ago)} {--to= : Last date} {--shift= : Only this shift id} {--resnapshot : Re-judge against the current roster and shift instead of the shift each record was made under} {--apply : Write the changes (default is a dry run)}';

    protected $description = 'Re-derive present/late status from check-in times (against each record frozen shift, or the current roster with --resnapshot)';

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
                $record->id, $record->employee_id, $record->date->toDateString(), $record->status, $status)),
            null,
            (bool) $this->option('resnapshot')
        );

        $this->info(($apply ? 'Updated' : 'Would update') . " {$changed} record(s).");

        return self::SUCCESS;
    }
}
