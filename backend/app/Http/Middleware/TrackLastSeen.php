<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records `users.last_seen_at` so chat/call presence indicators work.
 * Writes at most once per minute per user (guarded by a cache key) so it adds
 * no meaningful load, and never touches `updated_at`.
 */
class TrackLastSeen
{
    private const WRITE_INTERVAL_SECONDS = 60;

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && Cache::add('presence:last-seen:' . $user->id, 1, self::WRITE_INTERVAL_SECONDS)) {
            DB::table('users')->where('id', $user->id)->update(['last_seen_at' => now()]);
        }

        return $next($request);
    }
}
