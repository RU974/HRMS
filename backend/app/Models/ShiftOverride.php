<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShiftOverride extends Model
{
    use HasCompany;

    public const TYPE_OVERRIDE = 'override';
    public const TYPE_SWAP = 'swap';

    protected $fillable = ['company_id', 'employee_id', 'date', 'shift_id', 'type', 'shift_swap_id', 'reason', 'created_by'];

    protected $casts = ['date' => 'date:Y-m-d'];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class)->withoutGlobalScopes();
    }
}
