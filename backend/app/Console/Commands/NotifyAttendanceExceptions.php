<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\AttendanceAbsenceService;
use App\Services\AttendanceNotificationService;
use Illuminate\Console\Command;

class NotifyAttendanceExceptions extends Command
{
    /** Local hours (inclusive start, exclusive end) in which people are notified. */
    private const QUIET_BEFORE = 8;
    private const QUIET_FROM   = 22;

    protected $signature   = 'attendance:notify-exceptions {--days=2 : How many past days to check} {--company= : Limit to one company id} {--force : Ignore the 08:00-22:00 local-time window}';
    protected $description = 'Notify employees and their managers about absences, missing punches and repeated lates (company local time).';

    public function handle(AttendanceNotificationService $notifications, AttendanceAbsenceService $absences): int
    {
        $days  = max(1, (int) $this->option('days'));
        $total = 0;

        $companies = Company::query()
            ->when($this->option('company'), fn ($q, $id) => $q->whereKey($id))
            ->get();

        foreach ($companies as $company) {
            // "Today" and "now" are the company's own, not the server's.
            $now = now($company->timezone ?: config('app.timezone'));
            if (!$this->option('force') && ($now->hour < self::QUIET_BEFORE || $now->hour >= self::QUIET_FROM)) {
                continue;
            }
            $companyId = (string) $company->id;
            $today = $now->copy()->startOfDay();

            // A forgotten punch is flagged as soon as the shift is over, so today can already hold some.
            $absences->markMissingPunches($today->copy()->subDays($days), $companyId);

            $total += $notifications->dailyExceptions($today->copy()->subDays($days), $today, $companyId);
            $total += $notifications->repeatedLates($today, $companyId);
        }

        $this->info("Sent {$total} attendance notification(s).");

        return self::SUCCESS;
    }
}
