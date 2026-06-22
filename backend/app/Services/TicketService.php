<?php

namespace App\Services;

use App\Models\Ticket;
use App\Models\TicketComment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class TicketService
{
    public function createTicket(array $data, User $creator): Ticket
    {
        $data['created_by'] = $creator->id;
        $data['company_id'] = $creator->company_id;
        $data['status'] = 'open';

        return Ticket::create($data);
    }

    public function assignTicket(Ticket $ticket, string $userId): Ticket
    {
        $ticket->update(['assigned_to' => $userId]);

        return $ticket->fresh(['createdBy', 'assignedTo', 'department']);
    }

    public function changeStatus(Ticket $ticket, string $status): Ticket
    {
        $updates = ['status' => $status];

        if ($status === 'resolved') {
            $updates['resolved_at'] = now();
        } elseif ($status === 'closed') {
            $updates['closed_at'] = now();
        }

        $ticket->update($updates);

        return $ticket->fresh(['createdBy', 'assignedTo', 'department']);
    }

    public function addComment(Ticket $ticket, array $data, User $user): TicketComment
    {
        return $ticket->comments()->create([
            'user_id' => $user->id,
            'body' => $data['body'],
            'is_internal' => $data['is_internal'] ?? false,
        ]);
    }

    public function listTickets(User $user): Builder
    {
        $query = Ticket::with(['createdBy', 'assignedTo', 'department'])
            ->orderByDesc('created_at');

        if ($user->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN])) {
            return $query;
        }

        if ($user->hasAnyRole([
            User::ROLE_DEPARTMENT_MANAGER,
            User::ROLE_IT_SUPPORT,
            User::ROLE_HR_MANAGER,
            User::ROLE_HR_EXECUTIVE,
        ])) {
            $departmentId = $user->employee?->department_id;

            if ($departmentId) {
                return $query->where('department_id', $departmentId);
            }
        }

        return $query->where('created_by', $user->id);
    }
}
