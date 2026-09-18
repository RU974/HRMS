<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Services\TicketService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class TicketController extends Controller
{
    public function __construct(private readonly TicketService $ticketService)
    {
    }

    /**
     * Rule::exists(...) scoped to the requester's company — except for Super
     * Admin, whose company_id is null and who operates cross-company (see
     * CompanyScope), where the rule stays unscoped rather than matching nothing.
     */
    private function existsInOwnCompany(Request $request, string $table): Exists
    {
        $rule = Rule::exists($table, 'id');
        $companyId = $request->user()?->company_id;

        return $companyId ? $rule->where('company_id', $companyId) : $rule;
    }

    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $filters   = $request->only(['search', 'status', 'priority', 'category', 'department_id', 'mine', 'assigned_to_me']);
        $paginated = $this->ticketService->listTickets($request->user(), $filters)->paginate(15);

        return $this->ok([
            'data' => $paginated->items(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'total'        => $paginated->total(),
                'per_page'     => $paginated->perPage(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'tickets:create');

        $validated = $request->validate([
            'department_id' => [
                'required',
                'integer',
                $this->existsInOwnCompany($request, 'departments')->whereNull('deleted_at'),
            ],
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

        $ticket = Ticket::with(['createdBy', 'assignedTo', 'department', 'comments.user', 'attachments.user', 'activities.user'])->findOrFail($id);

        $user = $request->user();

        $this->authorize('view', $ticket);

        // Strip internal comments from non-agents/admins. HR Executive only holds
        // requester-level ticket access (view/create, no assign/edit), so it does
        // not see internal notes even on its own tickets.
        if (!$user->can('seeInternalNotes', $ticket)) {
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
        $this->authorize('manage', $ticket);

        $validated = $request->validate([
            'title'       => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'string'],
            'category'    => ['sometimes', Rule::in(['IT', 'HR', 'Finance', 'Admin', 'General'])],
            'priority'    => ['sometimes', Rule::in(['low', 'medium', 'high', 'critical'])],
            'status'      => ['sometimes', Rule::in(['open', 'in_progress', 'resolved', 'closed', 'reopened'])],
            'assigned_to' => ['sometimes', 'nullable', 'integer', $this->existsInOwnCompany($request, 'users')],
        ]);

        if (isset($validated['status']) && $validated['status'] !== $ticket->status) {
            $this->ticketService->changeStatus($ticket, $validated['status']);
            unset($validated['status']);
        }

        if (array_key_exists('assigned_to', $validated)) {
            $this->ticketService->ensureAssigneeEligible($ticket, $request->user(), $validated['assigned_to']);
            $this->ticketService->assignTicket($ticket, $validated['assigned_to'] !== null ? (string) $validated['assigned_to'] : null);
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
        $this->authorize('manage', $ticket);
        $ticket->delete();

        return $this->ok(null, 'Ticket deleted successfully');
    }

    public function assign(Request $request, string $id)
    {
        $this->authorizeAnyPermission($request, ['tickets:assign', 'tickets:manage_settings']);

        $ticket = Ticket::findOrFail($id);
        $this->authorize('manage', $ticket);

        $validated = $request->validate([
            'assigned_to' => ['required', 'integer', $this->existsInOwnCompany($request, 'users')],
        ]);

        $this->ticketService->ensureAssigneeEligible($ticket, $request->user(), $validated['assigned_to']);

        $ticket = $this->ticketService->assignTicket($ticket, (string) $validated['assigned_to']);

        return $this->ok($ticket, 'Ticket assigned successfully');
    }

    public function assignableUsers(Request $request, string $id)
    {
        $this->authorizeAnyPermission($request, ['tickets:assign', 'tickets:manage_settings']);

        $ticket = Ticket::findOrFail($id);
        $this->authorize('manage', $ticket);

        return $this->ok($this->ticketService->getAssignableUsers($ticket));
    }

    public function uploadAttachment(Request $request, string $ticketId)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $ticketQuery = Ticket::query();
        $this->scopeToCompany($request, $ticketQuery);
        $ticket = $ticketQuery->findOrFail($ticketId);
        $this->authorize('view', $ticket);

        $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png,docx,xlsx'],
        ]);

        $file       = $request->file('file');
        $companyId  = $request->user()->company_id;
        $uniqueName = Str::uuid() . '.' . $file->getClientOriginalExtension();
        $path       = "tickets/{$companyId}/{$ticketId}/{$uniqueName}";

        Storage::disk('local')->put($path, file_get_contents($file->getRealPath()));

        $attachment = TicketAttachment::create([
            'ticket_id' => $ticketId,
            'user_id'   => $request->user()->id,
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType() ?? $file->getClientMimeType(),
        ]);

        return $this->ok($attachment->load('user'), 'Attachment uploaded successfully', 201);
    }

    public function downloadAttachment(Request $request, string $ticketId, string $attachmentId)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $dlQuery = Ticket::query();
        $this->scopeToCompany($request, $dlQuery);
        $ticket = $dlQuery->findOrFail($ticketId);
        $this->authorize('view', $ticket);

        $attachment = TicketAttachment::where('ticket_id', $ticketId)->findOrFail($attachmentId);

        if (!Storage::disk('local')->exists($attachment->file_path)) {
            abort(404, 'File not found.');
        }

        return response()->download(
            Storage::disk('local')->path($attachment->file_path),
            $attachment->file_name,
            ['Content-Type' => $attachment->mime_type]
        );
    }

    public function changeStatus(Request $request, string $id)
    {
        $ticket = Ticket::findOrFail($id);
        $user   = $request->user();

        $validated = $request->validate([
            'status' => ['required', Rule::in(['open', 'in_progress', 'resolved', 'closed', 'reopened'])],
        ]);

        // A ticket's own creator may reopen it after resolution without
        // holding tickets:edit — everything else requires agent management
        // rights, scoped to this ticket (see TicketPolicy::manage).
        $isOwnerReopening = $validated['status'] === 'reopened'
            && $ticket->status === 'resolved'
            && (string) $ticket->created_by === (string) $user->id;

        if (!$isOwnerReopening) {
            $this->authorizeAnyPermission($request, ['tickets:edit', 'tickets:manage_settings']);
            $this->authorize('manage', $ticket);
        }

        $ticket = $this->ticketService->changeStatus($ticket, $validated['status']);

        return $this->ok($ticket, 'Ticket status updated successfully');
    }
}
