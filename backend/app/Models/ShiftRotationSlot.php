<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShiftRotationSlot extends Model
{
    protected $fillable = ['shift_rotation_id', 'position', 'shift_id'];

    public function rotation(): BelongsTo
    {
        return $this->belongsTo(ShiftRotation::class, 'shift_rotation_id');
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class)->withoutGlobalScopes();
    }
}
