<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

class Permission extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'module',
        'action',
        'display_name',
        'description',
        'company_id',
        'guard_name',
    ];

    protected $appends = ['key'];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'permission_role')
            ->withTimestamps();
    }

    public function users(): MorphToMany
    {
        return $this->morphedByMany(User::class, 'model', 'model_has_permissions', 'permission_id', 'model_id')
            ->withTimestamps();
    }

    public function getKeyAttribute(): string
    {
        return ($this->module ? $this->module . '.' : '') . $this->action;
    }
}