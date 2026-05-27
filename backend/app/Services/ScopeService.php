<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ScopeService
{
    public function applyScope(Builder $query, User $user, string $module): Builder
    {
        $scopeByRole = $user->rolesRelation
            ->mapWithKeys(fn ($role) => [$role->name => $role->pivot?->scope ?? []]);

        if ($module === 'employees' && $scopeByRole->has('Line Manager')) {
            $scope = (array) $scopeByRole->get('Line Manager', []);

            if (!empty($scope['department_id'])) {
                $query->where('department_id', $scope['department_id']);
                return $query;
            }

            $query->where('manager_id', $user->id);
        }

        return $query;
    }
}
