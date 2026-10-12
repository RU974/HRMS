<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OnboardingTemplate extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id',
        'name',
        'description',
        'is_default',
    ];

    protected $casts = [
        'is_default' => 'boolean',
    ];

    public function tasks(): HasMany
    {
        return $this->hasMany(OnboardingTemplateTask::class)->orderBy('sort_order')->orderBy('id');
    }
}
