<?php

namespace App\Console\Commands;

use App\Models\Leave;
use App\Services\LeaveAttendanceSync;
use Illuminate\Console\Command;

class SyncLeaveAttendance extends Command
{
    protected $signature   = 'attendance:sync-leaves {--from= : Only leaves ending on/after this date} {--days= : Shortcut for --from=today minus N days} {--to= : Only leaves starting on/before this date} {--company= : Limit to one company id} {--apply : Write the changes (default is a dry run)}';
    protected $description = 'Create the attendance rows for approved leaves that were approved before leave and attendance were linked';

    public function handle(LeaveAttendanceSync $sync): int
    {
        $apply = (bool) $this->option('apply');
        $from  = $this->option('from') ?: ($this->option('days') !== null ? now()->subDays((int) $this->option('days'))->toDateString() : null);
        $rows  = 0;
        $leaves = 0;

        Leave::query()
            ->with('employee')
            ->where('status', 'approved')
            ->when($from, fn ($q, $d) => $q->whereDate('to_date', '>=', $d))
            ->when($this->option('to'), fn ($q, $d) => $q->whereDate('from_date', '<=', $d))
            ->when($this->option('company'), fn ($q, $c) => $q->whereHas('employee', fn ($e) => $e->where('company_id', $c)))
            ->chunkById(200, function ($chunk) use ($sync, $apply, &$rows, &$leaves) {
                foreach ($chunk as $leave) {
                    $leaves++;
                    if ($apply) {
                        $rows += $sync->sync($leave);
                    } elseif ($leave->employee) {
                        $rows += count($sync->workingDates($leave, $leave->employee));
                    }
                }
            });

        $this->info(($apply ? 'Synced ' : 'Would cover up to ') . "{$rows} attendance day(s) across {$leaves} approved leave(s)."
            . ($apply ? '' : ' Re-run with --apply to write.'));

        return self::SUCCESS;
    }
}
