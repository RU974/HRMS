<?php

namespace App\Console\Commands;

use App\Services\AttendanceAbsenceService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class MarkAbsentEmployees extends Command
{
    protected $signature   = 'attendance:mark-absent {--days=3 : How many past days to check} {--company= : Limit to one company id}';
    protected $description = 'Mark employees absent on working days with no check-in/check-out and no approved leave.';

    public function handle(AttendanceAbsenceService $service): int
    {
        $days   = max(1, (int) $this->option('days'));
        $marked = $service->markAbsences(
            Carbon::today()->subDays($days),
            Carbon::yesterday(),
            $this->option('company') ? (string) $this->option('company') : null
        );

        $this->info("Marked {$marked} absence(s).");

        return self::SUCCESS;
    }
}
