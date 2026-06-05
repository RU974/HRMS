<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Support\Facades\Auth;

class TenantIsolation
{
    public function handle($request, Closure $next)
    {
        $user = Auth::user();
        if (! $user) {
            return $next($request);
        }

        // Attach tenant scoping info to the request for downstream use
        $request->attributes->set('company_id', $user->company_id);

        return $next($request);
    }
}
