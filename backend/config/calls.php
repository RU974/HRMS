<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Ringing timeout
    |--------------------------------------------------------------------------
    |
    | How long (in seconds) a call may sit in "ringing" status before the
    | calls:expire-stale scheduled command marks it as missed. Covers cases
    | where the callee's client disconnected without answering or rejecting.
    |
    */
    'ringing_timeout_seconds' => (int) env('CALL_RINGING_TIMEOUT_SECONDS', 60),

    /*
    |--------------------------------------------------------------------------
    | Participants
    |--------------------------------------------------------------------------
    |
    | Total people allowed on one call, host included. Calls are peer-to-peer
    | (full mesh), so quality degrades quickly past 4 participants. Raise this
    | only together with a media server (SFU).
    |
    */
    'max_participants' => (int) env('CALL_MAX_PARTICIPANTS', 4),

    /*
    |--------------------------------------------------------------------------
    | Heartbeat
    |--------------------------------------------------------------------------
    |
    | Joined participants ping the server every heartbeat_interval_seconds.
    | A participant silent for stale_participant_seconds is treated as
    | disconnected (closed tab, crashed browser, lost network) and removed by
    | calls:expire-stale, which ends the call if nobody is left.
    |
    */
    'heartbeat_interval_seconds' => (int) env('CALL_HEARTBEAT_INTERVAL_SECONDS', 15),
    'stale_participant_seconds' => (int) env('CALL_STALE_PARTICIPANT_SECONDS', 60),

    /*
    |--------------------------------------------------------------------------
    | Feature switches
    |--------------------------------------------------------------------------
    */
    'video_enabled' => (bool) env('CALL_VIDEO_ENABLED', true),
    'screen_share_enabled' => (bool) env('CALL_SCREEN_SHARE_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Signal retention
    |--------------------------------------------------------------------------
    |
    | WebRTC signalling rows are only useful while a call is being set up.
    | calls:prune-signals deletes rows older than this many hours.
    |
    */
    'signal_retention_hours' => (int) env('CALL_SIGNAL_RETENTION_HOURS', 24),

    /*
    |--------------------------------------------------------------------------
    | ICE servers (STUN / TURN)
    |--------------------------------------------------------------------------
    |
    | TURN is required for users behind symmetric NAT or strict corporate
    | firewalls. Credentials are never shipped in the frontend bundle: the API
    | issues short-lived credentials per user using coturn's "use-auth-secret"
    | (time-limited HMAC) scheme. Set CALL_TURN_SECRET to the same value as
    | `static-auth-secret` in turnserver.conf.
    |
    */
    'ice' => [
        'stun_urls' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CALL_STUN_URLS', 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'))
        ))),
        'turn_urls' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CALL_TURN_URLS', ''))
        ))),
        'turn_secret' => env('CALL_TURN_SECRET'),
        'turn_ttl_seconds' => (int) env('CALL_TURN_TTL_SECONDS', 3600),
    ],
];
