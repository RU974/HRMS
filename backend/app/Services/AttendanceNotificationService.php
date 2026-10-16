<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\BiometricDevice;
use App\Models\Employee;
use App\Models\NotificationItem;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;

/**
 * In-app attendance notifications: correction requests, daily exceptions (absences, missing
 * punches), repeated lates, and devices that stop syncing (never throws).
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

    /** Lates in a month before the employee and manager are told, when the policy has no "N lates = 1 absent" rule. */
    public const DEFAULT_LATE_ALERT_THRESHOLD = 3;

    /** Hours between repeat reminders while a device stays silent. */
    public const STALE_REMINDER_HOURS = 24;

    /**
     * Tell the employee and their line manager about absences and forgotten punches
     * on the days in [$from, $to]. Safe to re-run: a user is told once per record.
     *
     * @return int notifications created
     */
    public function dailyExceptions(CarbonInterface $from, CarbonInterface $to, ?string $companyId = null): int
    {
        $records = Attendance::query()
            ->with(['employee.user', 'employee.manager.user', 'employee.department.head.user'])
            ->whereDate('date', '>=', $from->toDateString())
            ->whereDate('date', '<=', $to->toDateString())
            ->whereIn('status', ['absent', ...Attendance::MISSING_STATUSES])
            ->where(fn ($q) => $q->whereNull('status_reason')->orWhere('status_reason', '!=', 'manual'))
            ->whereHas('employee', fn ($q) => $q->where('status', 'active')
                ->when($companyId, fn ($q2) => $q2->where('company_id', $companyId)))
            ->get();

        $sent = 0;
        foreach ($records as $record) {
            try {
                $sent += $this->exceptionFor($record);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $sent;
    }

    /** Companies can switch these alerts off in the attendance policy (default on). */
    private function alertsEnabled(?string $companyId): bool
    {
        return AttendancePolicy::forCompany($companyId)?->alerts_enabled ?? true;
    }

    /**
     * Who hears about an employee's exception besides the employee: the line manager and the
     * head of their department (when they are different people with a login), or HR
     * (Company Admin / HR Manager) when neither can be told.
     *
     * @return Collection<int, User>
     */
    private function overseers(Employee $employee, string $companyId): Collection
    {
        $people = collect([$employee->manager?->user, $employee->department?->head?->user])
            ->filter()
            ->reject(fn (User $u) => $u->id === $employee->user_id)
            ->unique('id')
            ->values();

        return $people->isNotEmpty()
            ? $people
            : $this->hrUsers($companyId)->reject(fn (User $u) => $u->id === $employee->user_id);
    }

    /** @return Collection<int, User> */
    private function hrUsers(string $companyId): Collection
    {
        return User::query()
            ->where('company_id', $companyId)
            ->whereHas('roles', fn ($q) => $q->whereIn('name', [User::ROLE_COMPANY_ADMIN, User::ROLE_HR_MANAGER]))
            ->get();
    }

    /**
     * Who can act on a silent device: people who can open the devices page (biometric:view),
     * so the notification link always works for them.
     *
     * @return Collection<int, User>
     */
    private function deviceAdmins(string $companyId): Collection
    {
        return User::query()
            ->where('company_id', $companyId)
            ->whereHas('roles', fn ($q) => $q->whereIn('name', [User::ROLE_COMPANY_ADMIN, User::ROLE_HR_MANAGER, User::ROLE_HR_EXECUTIVE, 'Attendance Manager']))
            ->get()
            ->filter(fn (User $u) => $u->hasAnyPermission(['biometric:view']))
            ->values();
    }

    /** Tell the employee themself (every employee has a login; email goes along when the company enabled it). */
    private function tellEmployee(Employee $employee, string $type, string $title, string $message, string $companyId, string $link): int
    {
        return $this->insert(collect([$employee->user])->filter(), $type, $title, $message, $companyId, null, $link, true);
    }

    private function mailEnabled(?string $companyId): bool
    {
        return (bool) (AttendancePolicy::forCompany($companyId)?->alerts_email ?? false);
    }

    /** Plain-text email; failures are logged, never thrown. */
    private function mail(?string $to, string $title, string $message, string $link): bool
    {
        if (!$to) {
            return false;
        }

        try {
            $url = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/') . $link;
            Mail::raw($message . "

Open in HRMS: {$url}
", fn ($m) => $m->to($to)->subject($title));

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }

    private function exceptionFor(Attendance $record): int
    {
        $employee = $record->employee;
        $companyId = $employee?->user?->company_id ?? $employee?->company_id;
        if (!$employee || !$companyId || !$this->alertsEnabled((string) $companyId)) {
            return 0;
        }

        $date = $record->date->toDateString();
        // $what: how the team hears it ("Ali was marked absent"); $you: how the employee does.
        [$type, $label, $what, $you, $advice] = match ($record->status) {
            'absent' => ['attendance_absent', 'absent', 'was marked absent', 'You were marked absent', 'If this is wrong, request a correction or apply for leave.'],
            Attendance::STATUS_MISSING_CHECK_IN => ['attendance_missing_check_in', 'missing check-in', 'has no check-in punch', 'You have no check-in punch', 'Please request an attendance correction.'],
            default => ['attendance_missing_check_out', 'missing check-out', 'has no check-out punch', 'You have no check-out punch', 'Please request an attendance correction.'],
        };
        $link = "/attendance?date={$date}";

        $sent = $this->tellEmployee(
            $employee,
            $type,
            ucfirst($label) . " on {$date}",
            "{$you} on {$date}. {$advice}",
            (string) $companyId,
            $link
        );

        $sent += $this->insert(
            $this->overseers($employee, (string) $companyId),
            $type . '_team',
            "{$employee->name}: {$label} on {$date}",
            "{$employee->name} {$what} on {$date}.",
            (string) $companyId,
            null,
            $link . '&employee=' . $employee->id,
            true
        );

        return $sent;
    }

    /**
     * Warn the employee and their manager once an employee has been late often in the
     * month of $day (up to and including it). The threshold is the policy's "N lates = 1
     * absent" count when set, else DEFAULT_LATE_ALERT_THRESHOLD; the alert repeats at each
     * further multiple of it. Safe to re-run.
     *
     * @return int notifications created
     */
    public function repeatedLates(CarbonInterface $day, ?string $companyId = null): int
    {
        $start = $day->copy()->startOfMonth();
        $inMonth = fn () => Attendance::query()
            ->with('employee')
            ->whereDate('date', '>=', $start->toDateString())
            ->whereDate('date', '<=', $day->toDateString())
            ->whereHas('employee', fn ($q) => $q->where('status', 'active')
                ->when($companyId, fn ($q2) => $q2->where('company_id', $companyId)));

        // Same measure as "N lates = 1 absent": late records, plus early leaves when the policy counts them.
        $counts = [];
        foreach ($inMonth()->where('status', 'late')->get(['id', 'employee_id']) as $row) {
            $counts[$row->employee_id] = ($counts[$row->employee_id] ?? 0) + 1;
        }
        $earlyLeaves = $inMonth()->whereNotNull('check_in')->whereNotNull('check_out')->where('status', '!=', 'late')->get();
        foreach ($earlyLeaves as $row) {
            $policy = AttendancePolicy::forEmployee($row->employee);
            if ($policy?->early_leave_enabled && $policy->early_leave_counts_as_late && $row->is_early_leave) {
                $counts[$row->employee_id] = ($counts[$row->employee_id] ?? 0) + 1;
            }
        }
        // A half day the policy gave for arriving too long after the cut-off is a late arrival too.
        $calculator = new AttendanceCalculator();
        $lateHalfDays = $inMonth()->where('status', Attendance::STATUS_HALF_DAY)->where('status_reason', Attendance::REASON_POLICY)
            ->whereNotNull('check_in')->get();
        foreach ($lateHalfDays as $row) {
            if ($calculator->isLateArrival($row, AttendancePolicy::forEmployee($row->employee), $row->judgingShift())) {
                $counts[$row->employee_id] = ($counts[$row->employee_id] ?? 0) + 1;
            }
        }
        $counts = collect($counts);

        if ($counts->isEmpty()) {
            return 0;
        }

        $employees = Employee::query()->with(['user', 'manager.user', 'department.head.user'])->whereKey($counts->keys())->get();
        $month = $start->format('Y-m');
        $sent = 0;

        foreach ($employees as $employee) {
            try {
                $lates = (int) $counts[$employee->id];
                $policy = AttendancePolicy::forEmployee($employee);
                if (!($policy?->alerts_enabled ?? true)) {
                    continue;
                }
                $threshold = ($policy?->late_alert_threshold ?? 0) > 0
                    ? (int) $policy->late_alert_threshold
                    : (($policy?->lates_per_absent ?? 0) > 0 ? (int) $policy->lates_per_absent : self::DEFAULT_LATE_ALERT_THRESHOLD);
                if ($lates < $threshold) {
                    continue;
                }

                $reached = intdiv($lates, $threshold) * $threshold;
                $link = "/attendance?month={$month}&status=late&lates={$reached}";
                $companyId = (string) ($employee->user?->company_id ?? $employee->company_id);
                $consequence = ($policy?->lates_per_absent ?? 0) > 0
                    ? " Every {$policy->lates_per_absent} lates count as one absent day."
                    : '';

                $sent += $this->tellEmployee(
                    $employee,
                    'attendance_repeated_late',
                    "Late {$lates} times this month",
                    "You have been late {$lates} times in {$start->format('F Y')}.{$consequence}",
                    $companyId,
                    $link
                );

                $sent += $this->insert(
                    $this->overseers($employee, $companyId),
                    'attendance_repeated_late_team',
                    "{$employee->name} was late {$lates} times this month",
                    "{$employee->name} has been late {$lates} times in {$start->format('F Y')}.",
                    $companyId,
                    null,
                    $link . '&employee=' . $employee->id,
                    true
                );
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $sent;
    }

    /**
     * Alert HR when a device (or the agent that feeds it) has stopped syncing, remind them
     * daily while it stays silent, and say so once it recovers.
     *
     * @return int notifications created
     */
    public function deviceSyncHealth(?string $companyId = null): int
    {
        $sent = 0;
        $devices = BiometricDevice::query()
            ->whereNotNull('company_id')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->get();

        foreach ($devices as $device) {
            try {
                if (!$device->monitor_sync || !$this->alertsEnabled((string) $device->company_id)) {
                    // Monitoring switched off: drop any open alert state so it starts clean if turned back on.
                    if ($device->stale_alerted_at !== null) {
                        $device->forceFill(['stale_alerted_at' => null])->save();
                    }
                    continue;
                }

                $hr = $this->deviceAdmins((string) $device->company_id);

                if ($device->isStale()) {
                    $due = $device->stale_alerted_at === null
                        || $device->stale_alerted_at->lt(now()->subHours(self::STALE_REMINDER_HOURS));
                    if (!$due) {
                        continue;
                    }

                    $last = $device->last_sync_at ? 'Last sync was ' . $device->last_sync_at->diffForHumans() . '.' : 'It has never synced.';
                    $sent += $this->insert(
                        $hr,
                        'biometric_device_stale',
                        "{$device->name} has stopped syncing",
                        "{$last} Check the device, its network connection and the biometric agent; attendance is not being recorded meanwhile.",
                        (string) $device->company_id,
                        null,
                        '/attendance/biometric-devices'
                    );
                    $device->forceFill(['stale_alerted_at' => now()])->save();
                } elseif ($device->stale_alerted_at !== null) {
                    $sent += $this->insert(
                        $hr,
                        'biometric_device_recovered',
                        "{$device->name} is syncing again",
                        "{$device->name} sent attendance data again after being silent.",
                        (string) $device->company_id,
                        null,
                        '/attendance/biometric-devices'
                    );
                    $device->forceFill(['stale_alerted_at' => null])->save();
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $sent;
    }

    /**
     * @param Collection<int, User> $recipients
     * @param bool $once skip a user who already has a notification of this type and link
     * @return int notifications created
     */
    private function insert(Collection $recipients, string $type, string $title, string $message, ?string $companyId, ?int $createdBy, string $link, bool $once = false): int
    {
        $created = 0;
        $mail = null;
        foreach ($recipients as $user) {
            if ($once && NotificationItem::query()
                ->where('user_id', $user->id)->where('type', $type)->where('link', $link)->exists()) {
                continue;
            }
            $created++;
            if ($mail === null) {
                $mail = $this->mailEnabled($companyId);
            }
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
            if ($mail) {
                $this->mail($user->email, $title, $message, $link);
            }
        }

        return $created;
    }
}
