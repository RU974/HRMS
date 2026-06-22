<?php

namespace App\Services;

use App\Models\Ticket;
use App\Models\TicketActivity;
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

        $ticket = Ticket::create($data);

        $this->logActivity($ticket, 'created', $creator->id, null);

        return $ticket;
    }

    public function assignTicket(Ticket $ticket, string $userId): Ticket
    {
        $ticket->update(['assigned_to' => $userId]);

        $assignee = User::find((int) $userId);
        $this->logActivity($ticket, 'assigned', auth()->id(), [
            'to_name' => $assignee?->name ?? 'Unknown',
        ]);

        return $ticket->fresh(['createdBy', 'assignedTo', 'department']);
    }

    public function changeStatus(Ticket $ticket, string $status): Ticket
    {
        $oldStatus = $ticket->status;
        $updates = ['status' => $status];

        if ($status === 'resolved') {
            $updates['resolved_at'] = now();
        } elseif ($status === 'closed') {
            $updates['closed_at'] = now();
            // Authenticated user = manually closed; no auth context = auto-closed by scheduler
            $updates['closed_by'] = auth()->id() ? (string) auth()->id() : null;
        }

        $ticket->update($updates);

        $this->logActivity($ticket, 'status_changed', auth()->id(), [
            'from' => $oldStatus,
            'to'   => $status,
        ]);

        return $ticket->fresh(['createdBy', 'assignedTo', 'department']);
    }

    public function addComment(Ticket $ticket, array $data, User $user): TicketComment
    {
        $isInternal = (bool) ($data['is_internal'] ?? false);

        $comment = $ticket->comments()->create([
            'user_id'     => $user->id,
            'body'        => $data['body'],
            'is_internal' => $isInternal,
        ]);

        $this->logActivity($ticket, 'commented', $user->id, ['is_internal' => $isInternal]);

        return $comment;
    }

    public function listTickets(User $user, array $filters = []): Builder
    {
        $query = Ticket::with(['createdBy', 'assignedTo', 'department'])
            ->orderByDesc('created_at');

        if ($user->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN])) {
            // Full access — apply optional mine filter
        } elseif ($user->hasAnyRole([
            User::ROLE_DEPARTMENT_MANAGER,
            User::ROLE_IT_SUPPORT,
            User::ROLE_HR_MANAGER,
            User::ROLE_HR_EXECUTIVE,
        ])) {
            $departmentId = $user->employee?->department_id;
            if ($departmentId) {
                $query->where('department_id', $departmentId);
            }
        } else {
            $query->where('created_by', $user->id);
        }

        if (!empty($filters['mine'])) {
            $query->where('created_by', $user->id);
        }

        if (!empty($filters['search'])) {
            $term = '%' . $filters['search'] . '%';
            $query->where(function (Builder $q) use ($term) {
                $q->where('title', 'like', $term)
                  ->orWhere('description', 'like', $term);
            });
        }

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (!empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }

        if (!empty($filters['category'])) {
            $query->where('category', $filters['category']);
        }

        if (!empty($filters['department_id'])) {
            $query->where('department_id', $filters['department_id']);
        }

        return $query;
    }

    private function logActivity(Ticket $ticket, string $action, ?int $actorId, ?array $meta): void
    {
        if ($actorId === null) return;

        TicketActivity::create([
            'ticket_id' => $ticket->id,
            'user_id'   => $actorId,
            'action'    => $action,
            'meta'      => $meta,
        ]);
    }
}
