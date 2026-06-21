<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryAssignment extends Model
{
    protected $table = 'inventory_assignments';

    protected $fillable = [
        'item_id',
        'employee_id',
        'quantity',
        'assigned_date',
        'returned_date',
        'status',
        'notes',
    ];

    protected $casts = [
        'assigned_date' => 'date',
        'returned_date' => 'date',
        'quantity' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
