<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixShiftedBiometricDates extends Command
{
    protected $signature   = 'attendance:fix-shifted-dates {--apply : Write the changes (default is a dry run)}';
    protected $description = 'Move biometric attendance rows whose date is later than their check-in date back to the check-in date (timezone-shift bug).';

    public function handle(): int
    {
        // A record's date is the shift-start date, so it can never be later than the
        // check-in date. Rows where it is were pushed forward by the old timezone shift.
        $rows = DB::table('attendances')
            ->where('source', 'biometric')
            ->whereNotNull('check_in')
            ->whereRaw('DATE(check_in) < date')
            ->get(['id', 'employee_id', 'date', 'check_in']);

        $fixed = 0;
        $skipped = 0;

        foreach ($rows as $row) {
            $newDate = substr((string) $row->check_in, 0, 10);

            $clash = DB::table('attendances')
                ->where('employee_id', $row->employee_id)
                ->whereDate('date', $newDate)
                ->where('id', '!=', $row->id)
                ->exists();

            if ($clash) {
                $skipped++;
                $this->warn("#{$row->id} employee {$row->employee_id}: {$row->date} -> {$newDate} skipped (record already exists)");
                continue;
            }

            $this->line("#{$row->id} employee {$row->employee_id}: " . substr((string) $row->date, 0, 10) . " -> {$newDate}");

            if ($this->option('apply')) {
                DB::table('attendances')->where('id', $row->id)->update(['date' => $newDate]);
            }
            $fixed++;
        }

        $this->info(($this->option('apply') ? 'Updated' : 'Would update') . " {$fixed} row(s); {$skipped} skipped.");
        if (!$this->option('apply')) {
            $this->comment('Dry run. Re-run with --apply to write changes.');
        }

        return self::SUCCESS;
    }
}
