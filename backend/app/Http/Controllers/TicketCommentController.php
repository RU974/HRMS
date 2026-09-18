<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Policies\TicketPolicy;
use App\Services\TicketService;
use Illuminate\Http\Request;

class TicketCommentController extends Controller
{
    public function __construct(
        private readonly TicketService $ticketService,
        private readonly TicketPolicy $ticketPolicy,
    ) {
    }

    public function store(Request $request, string $ticketId)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:edit', 'tickets:manage_settings']);

        $ticketQuery = Ticket::query();
        $this->scopeToCompany($request, $ticketQuery);
        $ticket = $ticketQuery->findOrFail($ticketId);

        $user = $request->user();

        $this->authorize('view', $ticket);

        $isAgent = $this->ticketPolicy->manage($user, $ticket);

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
