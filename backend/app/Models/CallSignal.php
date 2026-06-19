<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CallSignal extends Model
{
    protected $fillable = [
        'call_id',
        'from_user_id',
        'to_user_id',
        'type',
        'payload',
        'is_consumed',
    ];

    protected $casts = [
        'payload' => 'array',
        'is_consumed' => 'boolean',
    ];

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }

    public function fromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    public function toUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }
}
