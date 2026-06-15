<?php

namespace App\Http\Middleware;

use App\Models\License;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate access to a specific module based on the company's active license features.
 *
 * Apply per route group:  Route::middleware('license.feature:payroll')->group(...)
 *
 * Bypass conditions:
 *   - Super Admin (no company_id) — always allowed
 *   - No active license found     — defer to other guards
 *   - License has an empty features list — all modules treated as included
 */
class RequireLicenseFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $user = $request->user();

        // Super Admin has no company_id — unrestricted access
        if (! $user?->company_id) {
            return $next($request);
        }

        $license = License::query()
            ->where('company_id', $user->company_id)
            ->where('is_active', true)
            ->whereIn('status', ['active', 'trial'])
            ->orderByDesc('activated_at')
            ->orderByDesc('created_at')
            ->first();

        // No license or empty feature list → no gating (other middleware handles access)
        if (! $license || empty($license->features)) {
            return $next($request);
        }

        $licensed = array_map('strtolower', (array) $license->features);

        if (! in_array(strtolower($feature), $licensed, true)) {
            return response()->json([
                'success' => false,
                'message' => "The '{$feature}' module is not included in your {$license->edition} license. Please upgrade to access this feature.",
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
