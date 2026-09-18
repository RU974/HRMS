<?php

namespace App\Services\Orbit;

use App\Models\Announcement;
use App\Models\Attendance;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\LeaveBalance;
use App\Models\Ticket;
use App\Models\User;
use Carbon\Carbon;

/**
 * Read-only tools Orbit can call. Every tool is limited to the signed-in
 * user's own data (or company-wide public data), so Orbit can never reveal
 * more than the user could already see themselves.
 */
class OrbitTools
{
    /** @var array<int, array{label: string, path: string}> */
    private array $actions = [];

    public function __construct(private readonly User $user)
    {
    }

    /** @return array<int, array{label: string, path: string}> */
    public function actions(): array
    {
        return $this->actions;
    }

    /** @return array<int, array<string, mixed>> */
    public function definitions(): array
    {
        $none = ['type' => 'object', 'properties' => new \stdClass()];

        return [
            [
                'name' => 'navigate_to',
                'description' => 'Show the user a button that opens a page of the app. Use a path from the allowed pages list only.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'path' => ['type' => 'string', 'description' => 'App path, e.g. /leaves'],
                        'label' => ['type' => 'string', 'description' => 'Short button label, e.g. "Open Leaves"'],
                    ],
                    'required' => ['path', 'label'],
                ],
            ],
            ['name' => 'get_my_leave_balance', 'description' => 'The current leave balances of the user, per leave type.', 'input_schema' => $none],
            [
                'name' => 'get_my_leave_requests',
                'description' => 'The most recent leave requests of the user and their status.',
                'input_schema' => ['type' => 'object', 'properties' => ['limit' => ['type' => 'integer', 'description' => 'Max 10']]],
            ],
            [
                'name' => 'get_my_attendance',
                'description' => 'Attendance records of the user for a month, with a status summary.',
                'input_schema' => ['type' => 'object', 'properties' => ['month' => ['type' => 'string', 'description' => 'YYYY-MM, defaults to the current month']]],
            ],
            ['name' => 'get_upcoming_holidays', 'description' => 'Upcoming company holidays (next 5).', 'input_schema' => $none],
            ['name' => 'get_recent_announcements', 'description' => 'Latest published company announcements (up to 5).', 'input_schema' => $none],
            ['name' => 'get_my_tickets', 'description' => 'Support tickets created by the user, newest first (up to 10).', 'input_schema' => $none],
        ];
    }

    /** @param array<string, mixed> $input */
    public function run(string $name, array $input): array
    {
        return match ($name) {
            'navigate_to' => $this->navigateTo($input),
            'get_my_leave_balance' => $this->leaveBalance(),
            'get_my_leave_requests' => $this->leaveRequests((int) ($input['limit'] ?? 5)),
            'get_my_attendance' => $this->attendance((string) ($input['month'] ?? '')),
            'get_upcoming_holidays' => $this->holidays(),
            'get_recent_announcements' => $this->announcements(),
            'get_my_tickets' => $this->tickets(),
            default => ['error' => "Unknown tool {$name}"],
        };
    }

    private function employeeId(): ?int
    {
        return $this->user->employee?->id;
    }

    private function navigateTo(array $input): array
    {
        $path = (string) ($input['path'] ?? '');
        $allowed = collect((new OrbitPageCatalog())->forUser($this->user))->pluck('path')->all();

        if (!in_array($path, $allowed, true)) {
            return ['error' => 'That page does not exist or the user has no access to it.'];
        }

        $this->actions[] = ['label' => mb_substr((string) ($input['label'] ?? 'Open'), 0, 40), 'path' => $path];

        return ['ok' => true];
    }

    private function leaveBalance(): array
    {
        $employeeId = $this->employeeId();
        if (!$employeeId) {
            return ['error' => 'No employee profile is linked to this account.'];
        }

        $today = now()->toDateString();

        return LeaveBalance::with('leaveType:id,name')
            ->where('employee_id', $employeeId)
            ->whereDate('period_start', '<=', $today)
            ->whereDate('period_end', '>=', $today)
            ->get()
            ->map(fn (LeaveBalance $b) => [
                'leave_type' => $b->leaveType?->name,
                'accrued' => $b->accrued_days,
                'used' => $b->used_days,
                'pending' => $b->pending_days,
                'remaining' => $b->remaining_days,
            ])->all();
    }

    private function leaveRequests(int $limit): array
    {
        $employeeId = $this->employeeId();
        if (!$employeeId) {
            return ['error' => 'No employee profile is linked to this account.'];
        }

        return Leave::where('employee_id', $employeeId)
            ->latest('id')
            ->limit(max(1, min($limit, 10)))
            ->get(['type', 'from_date', 'to_date', 'half_day', 'status', 'reason'])
            ->toArray();
    }

    private function attendance(string $month): array
    {
        $employeeId = $this->employeeId();
        if (!$employeeId) {
            return ['error' => 'No employee profile is linked to this account.'];
        }

        try {
            $start = $month !== '' ? Carbon::createFromFormat('Y-m', $month)->startOfMonth() : now()->startOfMonth();
        } catch (\Throwable) {
            return ['error' => 'Month must be in YYYY-MM format.'];
        }

        $rows = Attendance::where('employee_id', $employeeId)
            ->whereBetween('date', [$start->toDateString(), $start->copy()->endOfMonth()->toDateString()])
            ->orderBy('date')
            ->get(['date', 'check_in', 'check_out', 'status']);

        return [
            'month' => $start->format('Y-m'),
            'summary' => $rows->countBy('status')->all(),
            'records' => $rows->map(fn ($r) => [
                'date' => (string) $r->date,
                'check_in' => $r->check_in ? (string) $r->check_in : null,
                'check_out' => $r->check_out ? (string) $r->check_out : null,
                'status' => $r->status,
            ])->all(),
        ];
    }

    private function holidays(): array
    {
        return Holiday::whereDate('holiday_date', '>=', now()->toDateString())
            ->orderBy('holiday_date')
            ->limit(5)
            ->get(['name', 'holiday_date', 'is_optional'])
            ->toArray();
    }

    private function announcements(): array
    {
        return Announcement::where('is_published', true)
            ->latest('published_at')
            ->limit(5)
            ->get(['title', 'category', 'published_at'])
            ->toArray();
    }

    private function tickets(): array
    {
        return Ticket::where('created_by', $this->user->id)
            ->latest('id')
            ->limit(10)
            ->get(['id', 'title', 'category', 'priority', 'status', 'created_at'])
            ->toArray();
    }
}
