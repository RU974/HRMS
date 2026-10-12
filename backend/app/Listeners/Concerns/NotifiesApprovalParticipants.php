<?php

namespace App\Listeners\Concerns;

use App\Models\Approval;
use App\Models\NotificationItem;

trait NotifiesApprovalParticipants
{
    /** Modules such as recruitment send their own, more specific notifications and mark their workflow so. */
    private function handledByModule(Approval $approval): bool
    {
        return (($approval->workflow?->definition['notifications'] ?? null) === 'module');
    }

    /** @param  array<int, int|string|null>  $userIds */
    private function notify(Approval $approval, array $userIds, string $type, string $title, string $message): void
    {
        foreach (array_unique(array_filter($userIds)) as $userId) {
            NotificationItem::create([
                'user_id' => $userId,
                'company_id' => $approval->company_id,
                'type' => $type,
                'title' => $title,
                'message' => $message,
                'link' => '/approvals',
                'is_read' => false,
                'created_by' => $approval->requested_by,
            ]);
        }
    }

    /** @return array<int, int> everyone who may act on the approval's current step (delegates included) */
    private function currentApproverIds(Approval $approval): array
    {
        $step = $approval->currentStep;

        return $step ? $step->approverUserIds($approval->requested_by ? (int) $approval->requested_by : null, $approval->company_id)->all() : [];
    }
}
