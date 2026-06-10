<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ScopeService
{
    public function applyScope(Builder $query, User $user, string $module): Builder
    {
        if ($module === 'employees' && $user->can('employees:view')) {
            $query->where('manager_id', $user->id);
        }

        return $query;
    }
}