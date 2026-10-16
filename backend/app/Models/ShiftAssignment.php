<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShiftAssignment extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id', 'employee_id', 'shift_id', 'shift_rotation_id', 'rotation_anchor_date',
        'starts_on', 'ends_on', 'notes', 'created_by',
    ];

    protected $casts = [
        'rotation_anchor_date' => 'date:Y-m-d',
        'starts_on' => 'date:Y-m-d',
        'ends_on' => 'date:Y-m-d',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class)->withoutGlobalScopes();
    }

    public function rotation(): BelongsTo
    {
        return $this->belongsTo(ShiftRotation::class, 'shift_rotation_id')->withoutGlobalScopes();
    }
}
