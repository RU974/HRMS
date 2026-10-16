<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\NotificationItem;
use App\Models\ShiftSwap;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * In-app notifications for shift swaps and roster changes (never throws).
 */
class ShiftNotificationService
{
    public function swapRequested(ShiftSwap $swap): void
    {
        $this->safely(function () use ($swap) {
            [$a, $b] = $this->people($swap);
            $this->send(collect([$b->user]), 'shift_swap_requested', "{$a->name} asked to swap shifts with you",
                "{$a->name} would like to swap: their shift on {$swap->requester_date->toDateString()} for yours on {$swap->counterpart_date->toDateString()}. Please accept or decline.",
                $b->company_id, $a->user_id);
        });
    }

    public function peerAnswered(ShiftSwap $swap, bool $accepted): void
    {
        $this->safely(function () use ($swap, $accepted) {
            [$a, $b] = $this->people($swap);
            if ($accepted) {
                $this->send($this->approvers($a), 'shift_swap_needs_approval', "Shift swap awaiting approval: {$a->name} and {$b->name}",
                    "{$a->name} and {$b->name} agreed to swap shifts ({$swap->requester_date->toDateString()} / {$swap->counterpart_date->toDateString()}). Please review it.",
                    $a->company_id, $b->user_id);
                $this->send(collect([$a->user]), 'shift_swap_peer_accepted', "{$b->name} accepted your swap", 'It now waits for approval from your manager or HR.', $a->company_id, $b->user_id);
            } else {
                $this->send(collect([$a->user]), 'shift_swap_rejected', "{$b->name} declined your swap", "{$b->name} declined the shift swap you asked for.", $a->company_id, $b->user_id);
            }
        });
    }

    public function decided(ShiftSwap $swap): void
    {
        $this->safely(function () use ($swap) {
            [$a, $b] = $this->people($swap);
            $word = $swap->status === ShiftSwap::APPROVED ? 'approved' : 'rejected';
            $note = $swap->decision_notes ? " Note: {$swap->decision_notes}" : '';
            $this->send(collect([$a->user, $b->user]), 'shift_swap_' . $word, "Your shift swap was {$word}",
                "The swap between {$a->name} ({$swap->requester_date->toDateString()}) and {$b->name} ({$swap->counterpart_date->toDateString()}) was {$word}.{$note}",
                $a->company_id, $swap->decided_by);
        });
    }

    public function cancelled(ShiftSwap $swap, ?int $byUserId): void
    {
        $this->safely(function () use ($swap, $byUserId) {
            [$a, $b] = $this->people($swap);
            $this->send(collect([$a->user, $b->user])->reject(fn ($u) => $u && $u->id === $byUserId), 'shift_swap_cancelled', 'A shift swap was cancelled',
                "The swap between {$a->name} and {$b->name} for {$swap->requester_date->toDateString()} / {$swap->counterpart_date->toDateString()} was cancelled.",
                $a->company_id, $byUserId);
        });
    }

    /** People on a roster who got a new schedule entry (override) for one day. */
    public function scheduleChanged(Employee $employee, string $summary, ?int $byUserId): void
    {
        $this->safely(function () use ($employee, $summary, $byUserId) {
            $employee->loadMissing('user');
            if ($employee->user && $employee->user->id !== $byUserId) {
                $this->send(collect([$employee->user]), 'shift_schedule_changed', 'Your work schedule changed', $summary, $employee->company_id, $byUserId, '/my-schedule');
            }
        });
    }

    /** The requester's manager plus HR / company admins of the company. */
    public function approvers(Employee $employee): Collection
    {
        $employee->loadMissing('manager.user');
        $users = collect();
        if ($employee->manager?->user) {
            $users->push($employee->manager->user);
        }

        return $users->merge(
            User::query()->where('company_id', $employee->company_id)
                ->whereHas('roles', fn ($q) => $q->whereIn('name', [User::ROLE_COMPANY_ADMIN, User::ROLE_HR_MANAGER, User::ROLE_HR_EXECUTIVE]))
                ->get()
        )->unique('id')->reject(fn (User $u) => in_array($u->id, [$employee->user_id], true));
    }

    /** @return array{0: Employee, 1: Employee} */
    private function people(ShiftSwap $swap): array
    {
        $swap->loadMissing(['requester.user', 'counterpart.user']);

        return [$swap->requester, $swap->counterpart];
    }

    private function send(Collection $recipients, string $type, string $title, string $message, ?string $companyId, ?int $createdBy, string $link = '/my-schedule'): void
    {
        foreach ($recipients->filter() as $user) {
            NotificationItem::create([
                'company_id' => $companyId,
                'user_id' => $user->id,
                'type' => $type,
                'title' => $title,
                'message' => $message,
                'link' => $link,
                'is_read' => false,
                'created_by' => $createdBy,
            ]);
        }
    }

    private function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
