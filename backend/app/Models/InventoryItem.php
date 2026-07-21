<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryItem extends Model
{
    use HasCompany, SoftDeletes;

    protected $table = 'inventory_items';

    protected $fillable = [
        'company_id',
        'category_id',
        'name',
        'sku',
        'quantity',
        'quantity_available',
        'unit_cost',
        'location',
        'condition',
        'description',
    ];

    protected $casts = [
        'unit_cost' => 'float',
        'quantity' => 'integer',
        'quantity_available' => 'integer',
    ];

    protected $appends = ['assigned_to_name'];

    public function getAssignedToNameAttribute(): ?string
    {
        if (! $this->relationLoaded('activeAssignments')) {
            return null;
        }

        return optional($this->activeAssignments->first()?->employee)->name;
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(InventoryCategory::class, 'category_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(InventoryAssignment::class, 'item_id');
    }

    public function activeAssignments(): HasMany
    {
        return $this->hasMany(InventoryAssignment::class, 'item_id')->where('status', 'assigned');
    }
}
