<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ScopeService
{
    public function applyScope(Builder $query, User $user, string $module): Builder
    {
        if ($module === 'employees' && $user->hasRole(User::ROLE_DEPARTMENT_MANAGER)) {
            $query->where('manager_id', $user->id);
        }

        return $query;
    }
}
