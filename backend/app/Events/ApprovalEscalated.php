<?php

namespace App\Events;

use App\Models\Approval;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ApprovalEscalated
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public Approval $approval;
    public ?string $reason = null;

    public function __construct(Approval $approval, ?string $reason = null)
    {
        $this->approval = $approval;
        $this->reason = $reason;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('approvals'),
        ];
    }
}
