<?php

namespace App\Events;

use App\Models\Leave;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class LeaveRequested
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly Leave $leave) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('leaves')];
    }
}