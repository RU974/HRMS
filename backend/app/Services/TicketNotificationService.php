<?php

namespace App\Services;

use App\Models\NotificationItem;
use App\Models\Ticket;
use App\Models\TicketComment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class TicketNotificationService
{
    public function notifyTicketCreated(Ticket $ticket): void
    {
        $ticket->loadMissing(['department', 'createdBy']);

        $deptName  = $ticket->department?->name ?? 'Unknown';
        $title     = "New ticket #{$ticket->id}: {$ticket->title} raised in {$deptName}";
        $link      = "/tickets/{$ticket->id}";
        $companyId = $ticket->company_id;

        $recipients = collect();

        $deptHeads = $this->findDepartmentHeads((int) $ticket->department_id, $companyId);
        $recipients = $recipients->merge($deptHeads->pluck('id'));

        if ($ticket->assigned_to) {
            $recipients->push($ticket->assigned_to);
        }

        $recipients = $recipients
            ->filter(fn ($id) => (int) $id !== (int) $ticket->created_by)
            ->unique()
            ->values()
            ->all();

        $this->createNotifications(
            recipientIds: $recipients,
            type:         'ticket_created',
            title:        $title,
            message:      $title,
            companyId:    $companyId,
            createdBy:    $ticket->created_by,
            link:         $link,
        );
    }

    public function notifyTicketAssigned(Ticket $ticket): void
    {
        if (!$ticket->assigned_to) {
            return;
        }

        $title = "You have been assigned ticket #{$ticket->id}: {$ticket->title}";
        $link  = "/tickets/{$ticket->id}";

        $this->createNotifications(
            recipientIds: [$ticket->assigned_to],
            type:         'ticket_assigned',
            title:        $title,
            message:      $title,
            companyId:    $ticket->company_id,
            createdBy:    (int) (auth()->id() ?? $ticket->created_by),
            link:         $link,
        );
    }

    public function notifyStatusChanged(Ticket $ticket): void
    {
        if (!$ticket->created_by) {
            return;
        }

        $title = "Your ticket #{$ticket->id} status changed to {$ticket->status}";
        $link  = "/tickets/{$ticket->id}";

        $this->createNotifications(
            recipientIds: [$ticket->created_by],
            type:         'ticket_status_changed',
            title:        $title,
            message:      $title,
            companyId:    $ticket->company_id,
            createdBy:    (int) (auth()->id() ?? $ticket->created_by),
            link:         $link,
        );
    }

    public function notifyTicketReopened(Ticket $ticket): void
    {
        $ticket->loadMissing(['department']);

        $title     = "Ticket #{$ticket->id}: {$ticket->title} has been reopened";
        $link      = "/tickets/{$ticket->id}";
        $companyId = $ticket->company_id;

        $recipients = collect();

        if ($ticket->assigned_to) {
            $recipients->push($ticket->assigned_to);
        }

        $deptHeads  = $this->findDepartmentHeads((int) $ticket->department_id, $companyId);
        $recipients = $recipients->merge($deptHeads->pluck('id'));

        $recipients = $recipients
            ->filter(fn ($id) => (int) $id !== (int) $ticket->created_by)
            ->unique()
            ->values()
            ->all();

        $this->createNotifications(
            recipientIds: $recipients,
            type:         'ticket_reopened',
            title:        $title,
            message:      $title,
            companyId:    $companyId,
            createdBy:    (int) (auth()->id() ?? $ticket->created_by),
            link:         $link,
        );
    }

    public function notifyAutoClose(Ticket $ticket): void
    {
        if (!$ticket->created_by) {
            return;
        }

        $title = "Your ticket #{$ticket->id} was auto-closed after 7 days";
        $link  = "/tickets/{$ticket->id}";

        $this->createNotifications(
            recipientIds: [$ticket->created_by],
            type:         'ticket_auto_closed',
            title:        $title,
            message:      $title,
            companyId:    $ticket->company_id,
            createdBy:    null,
            link:         $link,
        );
    }

    public function notifyCommentAdded(TicketComment $comment): void
    {
        $comment->loadMissing(['ticket']);
        $ticket = $comment->ticket;

        if (!$ticket) {
            return;
        }

        $title = "New reply on ticket #{$ticket->id}: {$ticket->title}";
        $link  = "/tickets/{$ticket->id}";

        $recipients = collect();

        if ($comment->is_internal) {
            if ($ticket->assigned_to) {
                $recipients->push($ticket->assigned_to);
            }
        } else {
            if ($ticket->created_by) {
                $recipients->push($ticket->created_by);
            }
            if ($ticket->assigned_to) {
                $recipients->push($ticket->assigned_to);
            }
        }

        $recipients = $recipients
            ->filter(fn ($id) => (int) $id !== (int) $comment->user_id)
            ->unique()
            ->values()
            ->all();

        $this->createNotifications(
            recipientIds: $recipients,
            type:         'ticket_comment',
            title:        $title,
            message:      $title,
            companyId:    $ticket->company_id,
            createdBy:    $comment->user_id,
            link:         $link,
        );
    }

    private function findDepartmentHeads(int $departmentId, string $companyId): Collection
    {
        return User::query()
            ->select(['id'])
            ->where('company_id', $companyId)
            ->whereHas('roles', fn ($q) => $q->where('name', User::ROLE_DEPARTMENT_MANAGER))
            ->whereHas('employee', fn ($q) => $q->where('department_id', $departmentId))
            ->get();
    }

    private function createNotifications(
        array $recipientIds,
        string $type,
        string $title,
        string $message,
        ?string $companyId,
        int|null $createdBy,
        string $link,
    ): void {
        if (empty($recipientIds)) {
            return;
        }

        $supportsCompanyScope = Schema::hasColumn('notifications', 'company_id');
        $supportsLink         = Schema::hasColumn('notifications', 'link');
        $now                  = now()->toDateTimeString();

        $rows = array_map(static function ($userId) use (
            $type, $title, $message, $companyId, $createdBy, $link,
            $supportsCompanyScope, $supportsLink, $now
        ): array {
            $row = [
                'user_id'    => $userId,
                'type'       => $type,
                'title'      => $title,
                'message'    => $message,
                'is_read'    => false,
                'created_by' => $createdBy,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if ($supportsCompanyScope) {
                $row['company_id'] = $companyId;
            }

            if ($supportsLink) {
                $row['link'] = $link;
            }

            return $row;
        }, $recipientIds);

        NotificationItem::query()->insert($rows);
    }
}
