<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

class Role extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'display_name',
        'description',
        'company_id',
        'guard_name',
    ];

    /**
     * Permissions belonging to this role.
     * Uses permission_role pivot — correct and consistent with RoleSeeder/RolePermissionSeeder.
     */
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_role');
    }

    /**
     * Users who hold this role.
     * Uses model_has_roles (morphed) — the single source of truth for all role assignments.
     *
     * REMOVED: assignedUsers() via 'role_user' table.
     * That table exists in the DB but is never written to by HasRoles::assignRole(),
     * so it was always empty and caused silent failures when queried.
     * All role lookups now go through model_has_roles exclusively.
     */
    public function users(): MorphToMany
    {
        return $this->morphedByMany(User::class, 'model', 'model_has_roles', 'role_id', 'model_id');
    }
}