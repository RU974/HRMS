<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Leave;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

/**
 * Resolves who should be notified for a given leave event and
 * writes NotificationItem rows for each recipient.
 *
 * Resolution order for approvers:
 *   1. The employee's direct manager (Employee.manager_id → User)
 *   2. Any user in the same company with the Department Manager role
 *      who manages the same department
 *   3. Any user in the same company with HR Manager or HR Executive role
 *
 * This means at least one notification always reaches an approver,
 * even if the employee has no manager assigned.
 */
class LeaveNotificationService
{
    /**
     * Notify all relevant approvers that a new leave request was submitted.
     */
    public function notifyApprovers(Leave $leave): void
    {
        $leave->loadMissing(['employee.user', 'employee.manager.user', 'employee.department']);

        $employee   = $leave->employee;
        $companyId  = $employee?->user?->company_id;
        $approvers  = $this->resolveApprovers($employee, $companyId);

        if ($approvers->isEmpty()) {
            return;
        }

        $employeeName  = $employee?->name ?? 'An employee';
        $leaveType     = $leave->type;
        $from          = $leave->from_date;
        $to            = $leave->to_date;
        $days          = $leave->requested_days;
        $dayLabel      = $days === 1 ? 'day' : 'days';

        $title   = "{$employeeName} requested {$leaveType} leave";
        $message = "{$employeeName} has submitted a {$leaveType} leave request "
            . "from {$from} to {$to} ({$days} {$dayLabel}). Please review and take action.";

        $this->createNotifications(
            recipientIds: $approvers->pluck('id')->all(),
            type:         'leave_requested',
            title:        $title,
            message:      $message,
            companyId:    $companyId,
            createdBy:    $employee?->user_id,
        );
    }

    /**
     * Notify the employee that their leave status changed (approved / rejected / cancelled).
     */
    public function notifyEmployee(Leave $leave, string $previousStatus): void
    {
        $leave->loadMissing(['employee.user']);

        $employeeUserId = $leave->employee?->user_id;
        if (!$employeeUserId) {
            return;
        }

        $companyId = $leave->employee?->user?->company_id;
        $newStatus = $leave->status;

        $title   = "Your {$leave->type} leave request was {$newStatus}";
        $message = $this->buildStatusMessage($leave, $newStatus);
        $type    = match ($newStatus) {
            'approved'  => 'leave_approved',
            'rejected'  => 'leave_rejected',
            'cancelled' => 'leave_cancelled',
            default     => 'leave_updated',
        };

        $this->createNotifications(
            recipientIds: [$employeeUserId],
            type:         $type,
            title:        $title,
            message:      $message,
            companyId:    $companyId,
            createdBy:    null,
        );
    }

    // ──────────────────────────────────────────────────────────────
    //  Internal helpers
    // ──────────────────────────────────────────────────────────────

    /**
     * Build the ordered list of approver User records for a leave request.
     *
     * @param  Employee|null  $employee
     * @param  string|null    $companyId
     * @return Collection<int, User>
     */
    private function resolveApprovers(?Employee $employee, ?string $companyId): Collection
    {
        $approvers = collect();

        if (!$employee || !$companyId) {
            return $approvers;
        }

        // 1. Direct manager
        $directManagerUser = $employee->manager?->user;
        if ($directManagerUser) {
            $approvers->push($directManagerUser);
        }

        // 2. Department Manager role users in same department
        $departmentId = $employee->department_id;
        if ($departmentId) {
            $deptManagers = User::query()
                ->where('company_id', $companyId)
                ->whereHas('roles', fn ($q) => $q->where('name', User::ROLE_DEPARTMENT_MANAGER))
                ->whereHas('employee', fn ($q) => $q->where('department_id', $departmentId))
                ->whereNotIn('id', $approvers->pluck('id')->filter()->all())
                ->get();

            $approvers = $approvers->merge($deptManagers);
        }

        // 3. HR Manager / HR Executive fallback (always included so HR is aware)
        $hrUsers = User::query()
            ->where('company_id', $companyId)
            ->whereHas('roles', fn ($q) => $q->whereIn('name', [
                User::ROLE_HR_MANAGER,
                User::ROLE_HR_EXECUTIVE,
            ]))
            ->whereNotIn('id', $approvers->pluck('id')->filter()->all())
            ->get();

        $approvers = $approvers->merge($hrUsers);

        // Exclude the employee themselves from the notification list
        return $approvers->filter(fn (User $u) => $u->id !== $employee->user_id)->values();
    }

    /**
     * Insert one NotificationItem row per recipient in a single bulk insert.
     *
     * @param  int[]         $recipientIds
     */
    private function createNotifications(
        array   $recipientIds,
        string  $type,
        string  $title,
        string  $message,
        ?string $companyId,
        ?int    $createdBy,
    ): void {
        if (empty($recipientIds)) {
            return;
        }

        $supportsCompanyScope = Schema::hasColumn('notifications', 'company_id');
        $now = now()->toDateTimeString();

        $rows = array_map(static function (int $userId) use (
            $type, $title, $message, $companyId, $createdBy, $supportsCompanyScope, $now
        ): array {
            $row = [
                'user_id'    => $userId,
                'type'       => $type,
                'title'      => $title,
                'message'    => $message,
                'is_read'    => false,
                'created_by' => $createdBy,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if ($supportsCompanyScope) {
                $row['company_id'] = $companyId;
            }

            return $row;
        }, $recipientIds);

        NotificationItem::query()->insert($rows);
    }

    private function buildStatusMessage(Leave $leave, string $status): string
    {
        $type  = $leave->type;
        $from  = $leave->from_date;
        $to    = $leave->to_date;
        $days  = $leave->requested_days;
        $label = $days === 1 ? 'day' : 'days';

        return match ($status) {
            'approved'  => "Your {$type} leave request from {$from} to {$to} ({$days} {$label}) has been approved.",
            'rejected'  => "Your {$type} leave request from {$from} to {$to} ({$days} {$label}) has been rejected.",
            'cancelled' => "Your {$type} leave request from {$from} to {$to} ({$days} {$label}) has been cancelled.",
            default     => "Your {$type} leave request from {$from} to {$to} has been updated to '{$status}'.",
        };
    }
}
