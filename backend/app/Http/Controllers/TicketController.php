<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\User;
use App\Services\TicketService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TicketController extends Controller
{
    public function __construct(private readonly TicketService $ticketService)
    {
    }

    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $tickets = $this->ticketService->listTickets($request->user())->get();

        return $this->ok($tickets);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'tickets:create');

        $validated = $request->validate([
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'category'      => ['required', Rule::in(['IT', 'HR', 'Finance', 'Admin', 'General'])],
            'priority'      => ['required', Rule::in(['low', 'medium', 'high', 'critical'])],
            'title'         => ['required', 'string', 'max:255'],
            'description'   => ['required', 'string'],
        ]);

        $ticket = $this->ticketService->createTicket($validated, $request->user());

        return $this->ok(
            $ticket->load(['createdBy', 'assignedTo', 'department']),
            'Ticket created successfully',
            201
        );
    }

    public function show(Request $request, string $id)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $ticket = Ticket::with(['createdBy', 'assignedTo', 'department', 'comments.user'])->findOrFail($id);

        $user = $request->user();

        if (
            !$user->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN]) &&
            !$user->hasAnyRole([User::ROLE_DEPARTMENT_MANAGER, User::ROLE_IT_SUPPORT, User::ROLE_HR_MANAGER, User::ROLE_HR_EXECUTIVE]) &&
            (string) $ticket->created_by !== (string) $user->id
        ) {
            abort(403, 'You are not authorized to view this ticket.');
        }

        // Strip internal comments from non-agents/admins
        if (!$user->hasAnyRole([
            User::ROLE_SUPER_ADMIN,
            User::ROLE_COMPANY_ADMIN,
            User::ROLE_DEPARTMENT_MANAGER,
            User::ROLE_IT_SUPPORT,
            User::ROLE_HR_MANAGER,
            User::ROLE_HR_EXECUTIVE,
        ])) {
            $ticket->setRelation(
                'comments',
                $ticket->comments->where('is_internal', false)->values()
            );
        }

        return $this->ok($ticket);
    }

    public function update(Request $request, string $id)
    {
        $this->authorizeAnyPermission($request, ['tickets:edit', 'tickets:manage_settings']);

        $ticket = Ticket::findOrFail($id);

        $validated = $request->validate([
            'title'       => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'string'],
            'category'    => ['sometimes', Rule::in(['IT', 'HR', 'Finance', 'Admin', 'General'])],
            'priority'    => ['sometimes', Rule::in(['low', 'medium', 'high', 'critical'])],
            'status'      => ['sometimes', Rule::in(['open', 'in_progress', 'resolved', 'closed', 'reopened'])],
            'assigned_to' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);

        if (isset($validated['status']) && $validated['status'] !== $ticket->status) {
            $this->ticketService->changeStatus($ticket, $validated['status']);
            unset($validated['status']);
        }

        if (array_key_exists('assigned_to', $validated)) {
            $this->ticketService->assignTicket($ticket, $validated['assigned_to']);
            unset($validated['assigned_to']);
        }

        if (!empty($validated)) {
            $ticket->update($validated);
        }

        return $this->ok(
            $ticket->fresh(['createdBy', 'assignedTo', 'department']),
            'Ticket updated successfully'
        );
    }

    public function destroy(Request $request, string $id)
    {
        $this->authorizePermission($request, 'tickets:delete');

        $ticket = Ticket::findOrFail($id);
        $ticket->delete();

        return $this->ok(null, 'Ticket deleted successfully');
    }

    public function assign(Request $request, string $id)
    {
        $this->authorizeAnyPermission($request, ['tickets:assign', 'tickets:manage_settings']);

        $ticket = Ticket::findOrFail($id);

        $validated = $request->validate([
            'assigned_to' => ['required', 'integer', 'exists:users,id'],
        ]);

        $ticket = $this->ticketService->assignTicket($ticket, $validated['assigned_to']);

        return $this->ok($ticket, 'Ticket assigned successfully');
    }

    public function changeStatus(Request $request, string $id)
    {
        $this->authorizeAnyPermission($request, ['tickets:edit', 'tickets:manage_settings']);

        $ticket = Ticket::findOrFail($id);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['open', 'in_progress', 'resolved', 'closed', 'reopened'])],
        ]);

        $ticket = $this->ticketService->changeStatus($ticket, $validated['status']);

        return $this->ok($ticket, 'Ticket status updated successfully');
    }
}
