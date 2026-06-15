<?php

return [
    /*
    |--------------------------------------------------------------------------
    | License defaults
    |--------------------------------------------------------------------------
    |
    | Values used when issuing new licenses. Override via .env to white-label
    | the product for different product teams without touching source code.
    |
    */
    'issued_by'     => env('LICENSE_ISSUED_BY',     'Slingshottech'),
    'support_email' => env('LICENSE_SUPPORT_EMAIL', 'support@slingshottech.com'),

    /*
    |--------------------------------------------------------------------------
    | Trial period
    |--------------------------------------------------------------------------
    |
    | Number of days a trial license remains valid before the
    | licenses:expire-trials scheduled command marks it as expired.
    |
    */
    'trial_days' => (int) env('LICENSE_TRIAL_DAYS', 14),
];
