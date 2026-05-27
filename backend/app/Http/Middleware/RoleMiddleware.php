<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user()?->loadMissing('rolesRelation');
        $userRoles = $user?->rolesRelation->pluck('name')->all() ?? [];
        if (count(array_intersect($roles, $userRoles)) === 0) {
            abort(403, 'You are not authorized to perform this action.');
        }

        return $next($request);
    }
}
