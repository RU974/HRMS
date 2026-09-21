<?php

namespace App\Broadcasting;

use Illuminate\Broadcasting\Broadcasters\PusherBroadcaster;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Pusher\ApiErrorException;
use Throwable;

/**
 * Reverb / Pusher broadcaster that never lets a websocket outage break the
 * HTTP request that triggered the event.
 *
 * Real-time delivery is an enhancement: the message, conversation or call is
 * already saved when the event fires, and clients re-read state on reconnect
 * (and via polling backstops). So when Reverb is unreachable we log a warning
 * and carry on, instead of returning a 500 for something that succeeded.
 *
 * A short circuit breaker keeps a dead server cheap: after one connection
 * failure, broadcasts are skipped for a few seconds rather than each waiting
 * out a connect timeout (a request can fire several events). The breaker only
 * trips on an *outage*. When Reverb is up but rejects one particular event
 * (for example a payload over its size limit) that event is logged and
 * dropped, and every other event keeps flowing.
 */
class ResilientPusherBroadcaster extends PusherBroadcaster
{
    public const BREAKER_KEY = 'broadcast:reverb:unreachable';

    /** Seconds to skip broadcasting after a failure. */
    public const BREAKER_SECONDS = 15;

    public function broadcast(array $channels, $event, array $payload = [])
    {
        if ($this->breakerOpen()) {
            return;
        }

        $socket = Arr::pull($payload, 'socket');
        $parameters = $socket !== null ? ['socket_id' => $socket] : [];

        foreach ((new Collection($this->formatChannels($channels)))->chunk(100) as $chunk) {
            try {
                $this->pusher->trigger($chunk->toArray(), $event, $payload, $parameters);
            } catch (ApiErrorException $e) {
                // A status code means the server answered: it is up and refused this one event.
                if ($e->getCode() >= 400) {
                    Log::error('Realtime event rejected by Reverb; it was not delivered. Check REVERB_MAX_REQUEST_SIZE.', [
                        'event' => $event,
                        'status' => $e->getCode(),
                        'payload_bytes' => strlen((string) json_encode($payload)),
                        'error' => $e->getMessage(),
                    ]);

                    continue;
                }

                $this->outage($event, $chunk->all(), $e);

                return;
            } catch (Throwable $e) {
                $this->outage($event, $chunk->all(), $e);

                return;
            }
        }
    }

    private function outage(string $event, array $channels, Throwable $e): void
    {
        $this->openBreaker();

        Log::warning('Realtime broadcast failed; continuing without it. Is Reverb running?', [
            'event' => $event,
            'channels' => array_map(fn ($c) => (string) $c, $channels),
            'error' => $e->getMessage(),
        ]);
    }

    private function breakerOpen(): bool
    {
        try {
            return Cache::has(self::BREAKER_KEY);
        } catch (Throwable) {
            // A broken cache must not also break broadcasting.
            return false;
        }
    }

    private function openBreaker(): void
    {
        try {
            Cache::put(self::BREAKER_KEY, true, self::BREAKER_SECONDS);
        } catch (Throwable) {
            // best effort
        }
    }
}
