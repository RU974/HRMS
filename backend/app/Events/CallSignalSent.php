<?php

namespace App\Events;

use App\Models\CallSignal;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallSignalSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly CallSignal $signal) {}

    /** Broadcast to the intended signal recipient's private channel. */
    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('call.' . $this->signal->to_user_id);
    }

    public function broadcastWith(): array
    {
        return [
            'signal' => [
                'id'           => $this->signal->id,
                'call_id'      => $this->signal->call_id,
                'from_user_id' => $this->signal->from_user_id,
                'type'         => $this->signal->type,
                'payload'      => $this->signal->payload,
            ],
        ];
    }

    public function broadcastAs(): string
    {
        return 'call.signal';
    }
}
