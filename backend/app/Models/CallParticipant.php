<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CallParticipant extends Model
{
    protected $fillable = [
        'call_id',
        'user_id',
        'status',
        'joined_at',
        'left_at',
    ];

    protected $casts = [
        'joined_at' => 'datetime',
        'left_at' => 'datetime',
    ];

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
