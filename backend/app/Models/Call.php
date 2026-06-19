<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Call extends Model
{
    protected $fillable = [
        'conversation_id',
        'initiated_by',
        'type',
        'call_type',
        'status',
        'company_id',
        'started_at',
        'ended_at',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiated_by');
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ChatConversation::class, 'conversation_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'call_participants', 'call_id', 'user_id')
            ->withPivot(['status', 'joined_at', 'left_at'])
            ->withTimestamps();
    }

    public function callParticipants(): HasMany
    {
        return $this->hasMany(CallParticipant::class);
    }

    public function signals(): HasMany
    {
        return $this->hasMany(CallSignal::class);
    }

    public function isActive(): bool
    {
        return in_array($this->status, ['ringing', 'active']);
    }

    public function duration(): ?int
    {
        if (!$this->started_at || !$this->ended_at) {
            return null;
        }

        return (int) $this->started_at->diffInSeconds($this->ended_at);
    }
}
