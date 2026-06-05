<?php

namespace App\Services;

use App\Events\ApprovalApproved;
use App\Events\ApprovalCreated;
use App\Events\ApprovalEscalated;
use App\Events\ApprovalRejected;
use App\Models\Approval;
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
        $escalationThresholdHours = config('approval.escalation_threshold_hours', 48);
        $thresholdTime = Carbon::now()->subHours($escalationThresholdHours);

        // Find pending approvals that exceed the threshold
        $overdueApprovals = Approval::where('status', 'pending')
            ->where('created_at', '<', $thresholdTime)
            ->where(function ($q) {
                $q->whereNull('escalated_at')
                    ->orWhere('escalated_at', '<', Carbon::now()->subHours(24));
            })
            ->get();

        foreach ($overdueApprovals as $approval) {
            try {
                // Dispatch escalation event
                Event::dispatch(new ApprovalEscalated(
                    $approval,
                    "Approval pending for more than {$escalationThresholdHours} hours"
                ));

                // Mark as escalated
                $approval->update(['escalated_at' => Carbon::now()]);

                // Log the escalation
                \App\Models\AuditLog::create([
                    'user_id' => null,
                    'action' => 'approval_escalated',
                    'entity_type' => 'Approval',
                    'entity_id' => $approval->id,
                    'changes' => [
                        'escalated_at' => Carbon::now(),
                        'reason' => "Escalation after {$escalationThresholdHours} hours",
                    ],
                    'ip_address' => 'system',
                    'user_agent' => 'approval-escalation-service',
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
