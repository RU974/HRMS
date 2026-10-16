<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShiftSwap extends Model
{
    use HasCompany;

    public const PENDING_PEER = 'pending_peer';
    public const PENDING_APPROVAL = 'pending_approval';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';
    public const CANCELLED = 'cancelled';

    protected $fillable = [
        'company_id', 'requester_id', 'counterpart_id', 'requester_date', 'counterpart_date', 'reason',
        'status', 'peer_responded_at', 'decided_by', 'decided_at', 'decision_notes',
    ];

    protected $casts = [
        'requester_date' => 'date:Y-m-d',
        'counterpart_date' => 'date:Y-m-d',
        'peer_responded_at' => 'datetime',
        'decided_at' => 'datetime',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'requester_id');
    }

    public function counterpart(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'counterpart_id');
    }

    public function isOpen(): bool
    {
        return in_array($this->status, [self::PENDING_PEER, self::PENDING_APPROVAL], true);
    }
}
