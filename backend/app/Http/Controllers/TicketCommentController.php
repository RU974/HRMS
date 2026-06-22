<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\User;
use App\Services\TicketService;
use Illuminate\Http\Request;

class TicketCommentController extends Controller
{
    public function __construct(private readonly TicketService $ticketService)
    {
    }

    public function store(Request $request, string $ticketId)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:edit', 'tickets:manage_settings']);

        $ticket = Ticket::findOrFail($ticketId);

        $user = $request->user();

        $isAgent = $user->hasAnyRole([
            User::ROLE_SUPER_ADMIN,
            User::ROLE_COMPANY_ADMIN,
            User::ROLE_DEPARTMENT_MANAGER,
            User::ROLE_IT_SUPPORT,
            User::ROLE_HR_MANAGER,
            User::ROLE_HR_EXECUTIVE,
        ]);

        $validated = $request->validate([
            'body'        => ['required', 'string'],
            'is_internal' => ['sometimes', 'boolean'],
        ]);

        // Non-agents cannot post internal notes
        if (!$isAgent) {
            $validated['is_internal'] = false;
        }

        $comment = $this->ticketService->addComment($ticket, $validated, $user);

        return $this->ok(
            $comment->load('user'),
            'Comment added successfully',
            201
        );
    }
}
