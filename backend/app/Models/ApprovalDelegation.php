<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalDelegation extends Model
{
    protected $fillable = [
        'delegator_user_id',
        'delegate_user_id',
        'starts_at',
        'ends_at',
        'company_id',
        'notes',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];

    public function delegator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegator_user_id');
    }

    public function delegate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegate_user_id');
    }

    public function isActive(): bool
    {
        return now()->between($this->starts_at, $this->ends_at);
    }
}
