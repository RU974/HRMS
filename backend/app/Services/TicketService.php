<?php

namespace App\Services;

use App\Models\Ticket;
use App\Models\TicketActivity;
use App\Models\TicketComment;
use App\Models\User;
use App\Policies\TicketPolicy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class TicketService
{
    public function __construct(private readonly TicketPolicy $ticketPolicy)
    {
    }

    public function createTicket(array $data, User $creator): Ticket
    {
        $data['created_by'] = $creator->id;
        $data['company_id'] = $creator->company_id;
        $data['status'] = 'open';

        $ticket = Ticket::create($data);

        $this->logActivity($ticket, 'created', $creator->id, null);

        return $ticket;
    }

    public function assignTicket(Ticket $ticket, ?string $userId): Ticket
    {
        $previousAssignee = $ticket->assignedTo;

        $ticket->update(['assigned_to' => $userId]);

        $newAssignee = $userId !== null ? User::find((int) $userId) : null;

        $this->logActivity($ticket, 'assigned', auth()->id(), [
            'from_name' => $previousAssignee?->name ?? 'Unassigned',
            'to_name'   => $newAssignee?->name ?? 'Unassigned',
        ]);

        return $ticket->fresh(['createdBy', 'assignedTo', 'department']);
    }

    /**
     * Blocks assigning a ticket to a user who isn't in getAssignableUsers(),
     * unless the actor has full ticket management authority (Company
     * Admin/Super Admin/manage_settings), who may assign to anyone in the company.
     */
    public function ensureAssigneeEligible(Ticket $ticket, User $actor, ?int $assigneeId): void
    {
        if ($assigneeId === null) {
            return;
        }

        if ($this->ticketPolicy->hasCompanyWideAccess($actor) || $actor->can('tickets:manage_settings')) {
            return;
        }

        $eligibleIds = $this->getAssignableUsers($ticket)->pluck('id')->all();

        if (!in_array($assigneeId, $eligibleIds, true)) {
            throw ValidationException::withMessages([
                'assigned_to' => 'Selected user is not eligible to be assigned this ticket.',
            ]);
        }
    }

    /**
     * Users eligible to be assigned this ticket: agent-capable roles in the
     * same company, scoped to the ticket's department where applicable.
     */
    public function getAssignableUsers(Ticket $ticket): Collection
    {
        return User::query()
            ->where('company_id', $ticket->company_id)
            ->whereHas('roles', fn (Builder $q) => $q->whereIn('name', [
                User::ROLE_COMPANY_ADMIN,
                User::ROLE_HR_MANAGER,
                User::ROLE_IT_SUPPORT,
                User::ROLE_DEPARTMENT_MANAGER,
            ]))
            ->with('employee:id,user_id,department_id')
            ->get()
            ->filter(function (User $user) use ($ticket) {
                // Company-wide roles can be assigned any ticket; department-scoped
                // agents (Department Manager) are restricted to their own department.
                if (!$user->hasAnyRole([User::ROLE_DEPARTMENT_MANAGER])
                    || $this->ticketPolicy->hasCompanyWideAccess($user)
                    || $user->hasAnyRole([User::ROLE_HR_MANAGER, User::ROLE_IT_SUPPORT])
                ) {
                    return true;
                }

                return $user->employee?->department_id === $ticket->department_id;
            })
            ->map(fn (User $user) => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
            ])
            ->values();
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

        if ($this->ticketPolicy->hasCompanyWideAccess($user)) {
            // Full access — apply optional mine filter
        } elseif ($this->ticketPolicy->isDepartmentScopedAgent($user)) {
            $departmentId = $user->employee?->department_id;
            if ($departmentId) {
                $query->where('department_id', $departmentId);
            } elseif ($user->hasAnyRole([User::ROLE_DEPARTMENT_MANAGER])) {
                // Fail closed: a Department Manager without a department
                // assigned must not default to seeing every department's
                // tickets — matches TicketPolicy::manage()'s same fail-closed
                // behavior for this misconfigured-account case. HR Manager /
                // IT Support are intentionally company-wide regardless of
                // department, so they fall through unfiltered as before.
                $query->whereRaw('1 = 0');
            }
        } else {
            $query->where('created_by', $user->id);
        }

        if (!empty($filters['mine'])) {
            $query->where('created_by', $user->id);
        }

        if (!empty($filters['assigned_to_me'])) {
            $query->where('assigned_to', $user->id);
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
