<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\User;
use App\Services\TicketService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TicketController extends Controller
{
    public function __construct(private readonly TicketService $ticketService)
    {
    }

    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $filters   = $request->only(['search', 'status', 'priority', 'category', 'department_id', 'mine']);
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

        $ticket = Ticket::with(['createdBy', 'assignedTo', 'department', 'comments.user', 'attachments.user', 'activities.user'])->findOrFail($id);

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

    public function uploadAttachment(Request $request, string $ticketId)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $ticketQuery = Ticket::query();
        $this->scopeToCompany($request, $ticketQuery);
        $ticket = $ticketQuery->findOrFail($ticketId);

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
        $dlQuery->findOrFail($ticketId);

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
        $this->authorizeAnyPermission($request, ['tickets:edit', 'tickets:manage_settings']);

        $ticket = Ticket::findOrFail($id);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['open', 'in_progress', 'resolved', 'closed', 'reopened'])],
        ]);

        $ticket = $this->ticketService->changeStatus($ticket, $validated['status']);

        return $this->ok($ticket, 'Ticket status updated successfully');
    }
}
