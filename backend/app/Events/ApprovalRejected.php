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

class ApprovalRejected
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public Approval $approval;

    public function __construct(Approval $approval)
    {
        $this->approval = $approval;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('approvals'),
        ];
    }
}
