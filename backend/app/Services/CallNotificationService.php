<?php

namespace App\Services;

use App\Models\Call;
use App\Models\NotificationItem;
use Illuminate\Support\Facades\Schema;

class CallNotificationService
{
    public function notifyMissedCall(Call $call, array $missedUserIds): void
    {
        if (empty($missedUserIds)) {
            return;
        }

        $call->loadMissing('initiator');

        $callerName = $call->initiator->name ?? 'Someone';
        $title      = "Missed {$call->type} call from {$callerName}";
        $link       = $call->conversation_id ? "/chat/{$call->conversation_id}" : '/call-history';

        $this->createNotifications(
            recipientIds: $missedUserIds,
            type:         'call_missed',
            title:        $title,
            message:      $title,
            companyId:    $call->company_id,
            createdBy:    $call->initiated_by,
            link:         $link,
        );
    }

    private function createNotifications(
        array $recipientIds,
        string $type,
        string $title,
        string $message,
        ?string $companyId,
        ?int $createdBy,
        string $link,
    ): void {
        $recipientIds = array_values(array_unique($recipientIds));

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
