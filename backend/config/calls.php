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
    'ringing_timeout_seconds' => env('CALL_RINGING_TIMEOUT_SECONDS', 60),
];
