<?php

namespace App\Services;

use App\Events\ApprovalApproved;
use App\Events\ApprovalCreated;
use App\Events\ApprovalEscalated;
use App\Events\ApprovalRejected;
use App\Models\Approval;
use App\Services\AuditService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Event;

class ApprovalEscalationService
{
    /**
     * Register event listeners for approval workflows
     */
    public static function registerListeners(): void
    {
        Event::listen(ApprovalCreated::class, 'App\Listeners\NotifyApprovalCreated');
        Event::listen(ApprovalApproved::class, 'App\Listeners\NotifyApprovalApproved');
        Event::listen(ApprovalRejected::class, 'App\Listeners\NotifyApprovalRejected');
        Event::listen(ApprovalEscalated::class, 'App\Listeners\NotifyApprovalEscalated');
    }

    /**
     * Check for overdue approvals and escalate them
     * Run this via a scheduled command (e.g., php artisan schedule:work)
     */
    public static function escalateOverdueApprovals(): void
    {
        $defaultThresholdHours = config('approval.escalation_threshold_hours', 48);
        $fallbackThreshold = Carbon::now()->subHours($defaultThresholdHours);

        // Overdue when the per-step/per-workflow due_at has passed, or — for approvals
        // started before due_at existed — the global default threshold from created_at.
        $overdueApprovals = Approval::where('status', 'pending')
            ->whereNull('escalated_at')
            ->where(function ($q) use ($fallbackThreshold) {
                $q->where('due_at', '<=', Carbon::now())
                    ->orWhere(function ($q2) use ($fallbackThreshold) {
                        $q2->whereNull('due_at')->where('created_at', '<', $fallbackThreshold);
                    });
            })
            ->with('currentStep')
            ->get();

        foreach ($overdueApprovals as $approval) {
            try {
                $hours = $approval->currentStep?->escalation_hours
                    ?? $approval->workflow?->escalation_hours
                    ?? $defaultThresholdHours;

                Event::dispatch(new ApprovalEscalated(
                    $approval,
                    "Approval pending for more than {$hours} hours"
                ));

                $approval->update(['escalated_at' => Carbon::now()]);

                AuditService::record([
                    'action' => 'approval_escalated',
                    'module' => $approval->module,
                    'company_id' => $approval->company_id,
                    'approval_id' => $approval->id,
                    'old_value' => null,
                    'new_value' => [
                        'escalated_at' => Carbon::now()->toDateTimeString(),
                        'reason' => "Escalation after {$hours} hours",
                    ],
                ]);
            } catch (\Exception $e) {
                \Log::error("Failed to escalate approval {$approval->id}", ['error' => $e->getMessage()]);
            }
        }
    }

    /**
     * Auto-approve approvals with no conditions (optional feature)
     */
    public static function autoApproveEligible(): void
    {
        $approvals = Approval::where('status', 'pending')
            ->whereHas('workflow', function ($q) {
                $q->where('auto_approve_when_unconditioned', true);
            })
            ->get();

        foreach ($approvals as $approval) {
            $currentStep = $approval->currentStep();
            if ($currentStep && !$currentStep->conditions) {
                try {
                    $approval->update([
                        'status' => 'approved',
                        'approved_at' => now(),
                        'current_step' => $currentStep->step_number + 1,
                    ]);

                    ApprovalApproved::dispatch($approval);
                } catch (\Exception $e) {
                    \Log::error("Failed to auto-approve approval {$approval->id}", ['error' => $e->getMessage()]);
                }
            }
        }
    }

    /**
     * Get approval statistics
     */
    public static function getStatistics()
    {
        return [
            'total' => Approval::count(),
            'pending' => Approval::where('status', 'pending')->count(),
            'approved' => Approval::where('status', 'approved')->count(),
            'rejected' => Approval::where('status', 'rejected')->count(),
            'average_resolution_hours' => $this->calculateAverageResolution(),
            'escalated_count' => Approval::whereNotNull('escalated_at')->count(),
        ];
    }

    private static function calculateAverageResolution()
    {
        $resolved = Approval::whereIn('status', ['approved', 'rejected'])
            ->select('created_at', 'approved_at', 'rejected_at')
            ->get();

        if ($resolved->isEmpty()) {
            return 0;
        }

        $total = 0;
        $count = 0;

        foreach ($resolved as $approval) {
            $endTime = $approval->approved_at ?? $approval->rejected_at;
            if ($endTime) {
                $hours = $approval->created_at->diffInHours($endTime);
                $total += $hours;
                $count++;
            }
        }

        return $count > 0 ? round($total / $count, 2) : 0;
    }
}
