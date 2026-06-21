<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryCategory extends Model
{
    use HasCompany;

    protected $table = 'inventory_categories';

    protected $fillable = [
        'company_id',
        'name',
        'description',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(InventoryItem::class, 'category_id');
    }
}
