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
 *
 * Fail-closed: companies with no active/trial license are denied access to all
 * feature-gated routes. An active license with an empty features array is treated
 * as "no features licensed" (also denied). This prevents unlicensed companies from
 * silently inheriting full module access.
 *
 * Grace period: companies whose license expired within LICENSE_GRACE_DAYS days are
 * still allowed through so a delayed renewal doesn't cause an abrupt outage.
 * The grace window defaults to 7 days and is configurable via .env.
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

        $graceDays = (int) config('licenses.grace_days', 7);

        $license = License::query()
            ->where('company_id', $user->company_id)
            ->where('is_active', true)
            ->where(function ($q) use ($graceDays) {
                // Active or trial licenses
                $q->whereIn('status', ['active', 'trial'])
                  // OR recently-expired licenses still within the grace window
                  ->orWhere(function ($q2) use ($graceDays) {
                      $q2->where('status', 'expired')
                         ->where('expires_at', '>=', now()->subDays($graceDays));
                  });
            })
            ->orderByDesc('activated_at')
            ->orderByDesc('created_at')
            ->first();

        // No valid license (including grace period) → deny access
        if (! $license) {
            return response()->json([
                'success' => false,
                'message' => 'No active license found for your company. Please activate a license to access this feature.',
            ], Response::HTTP_FORBIDDEN);
        }

        // Empty features list means no modules are licensed
        if (empty($license->features)) {
            return response()->json([
                'success' => false,
                'message' => "No modules are enabled on your current license. Please contact support.",
            ], Response::HTTP_FORBIDDEN);
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
