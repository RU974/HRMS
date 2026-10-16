<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShiftRotation extends Model
{
    use HasCompany;

    protected $fillable = ['company_id', 'name', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function slots(): HasMany
    {
        return $this->hasMany(ShiftRotationSlot::class)->orderBy('position');
    }
}
