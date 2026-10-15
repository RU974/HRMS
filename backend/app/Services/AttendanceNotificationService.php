<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * In-app notifications for attendance correction requests (never throws).
 */
class AttendanceNotificationService
{
    public function correctionRequested(Attendance $attendance): void
    {
        try {
            $attendance->loadMissing(['employee.user', 'employee.manager.user']);
            $employee = $attendance->employee;
            $companyId = $employee?->user?->company_id;
            if (!$employee || !$companyId) {
                return;
            }

            $recipients = collect();
            if ($employee->manager?->user) {
                $recipients->push($employee->manager->user);
            }
            $recipients = $recipients->merge(
                User::query()
                    ->where('company_id', $companyId)
                    ->whereHas('roles', fn ($q) => $q->whereIn('name', [User::ROLE_COMPANY_ADMIN, User::ROLE_HR_MANAGER, User::ROLE_HR_EXECUTIVE]))
                    ->get()
            )->unique('id')->reject(fn (User $u) => $u->id === $employee->user_id);

            $date = $attendance->date?->toDateString();
            $this->insert(
                $recipients,
                'attendance_correction_requested',
                "{$employee->name} requested an attendance correction",
                "{$employee->name} asked for a correction to the attendance record of {$date}. Please review it.",
                $companyId,
                $employee->user_id,
                '/attendance/corrections'
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public function correctionReviewed(Attendance $attendance, ?int $reviewerId): void
    {
        try {
            $attendance->loadMissing(['employee.user']);
            $userId = $attendance->employee?->user_id;
            if (!$userId) {
                return;
            }

            $date = $attendance->date?->toDateString();
            $status = $attendance->correction_status;
            $this->insert(
                collect([User::find($userId)])->filter(),
                'attendance_correction_' . $status,
                "Your attendance correction was {$status}",
                "Your correction request for {$date} was {$status}."
                    . ($attendance->correction_response_notes ? " Note: {$attendance->correction_response_notes}" : ''),
                $attendance->employee->user->company_id,
                $reviewerId,
                '/attendance'
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** @param Collection<int, User> $recipients */
    private function insert(Collection $recipients, string $type, string $title, string $message, ?string $companyId, ?int $createdBy, string $link): void
    {
        foreach ($recipients as $user) {
            NotificationItem::create([
                'company_id' => $companyId,
                'user_id'    => $user->id,
                'type'       => $type,
                'title'      => $title,
                'message'    => $message,
                'link'       => $link,
                'is_read'    => false,
                'created_by' => $createdBy,
            ]);
        }
    }
}
