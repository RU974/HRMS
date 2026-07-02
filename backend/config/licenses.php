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
    'issued_by'     => env('LICENSE_ISSUED_BY',     'Slingshotteck'),
    'support_email' => env('LICENSE_SUPPORT_EMAIL', 'support@slingshotteck.com'),

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

    /*
    |--------------------------------------------------------------------------
    | Grace period
    |--------------------------------------------------------------------------
    |
    | Days after license expiry during which access to feature-gated routes
    | is still permitted. This prevents an abrupt lockout when a renewal is
    | delayed by a few days. Set to 0 to disable the grace window entirely.
    |
    */
    'grace_days' => (int) env('LICENSE_GRACE_DAYS', 7),

    /*
    |--------------------------------------------------------------------------
    | Minimum billed seat count
    |--------------------------------------------------------------------------
    |
    | The floor below which usage is still billed as if this many seats were
    | occupied. Surfaced in pricing UI only — not hard-enforced on employee
    | creation (companies under the floor can still add employees freely).
    |
    */
    'min_seats' => (int) env('LICENSE_MIN_SEATS', 5),

    /*
    |--------------------------------------------------------------------------
    | Edition defaults
    |--------------------------------------------------------------------------
    |
    | Default seat limits and feature sets applied when a new license is issued
    | without explicit overrides. Also exposed via GET /settings/licenses/editions
    | so the frontend can stay in sync without hardcoding these values.
    |
    */

    'editions' => [
        'Starter' => [
            'max_employees' => 20,
            'max_users'     => null,
            'features'      => ['attendance', 'leaves'],
        ],
        'Professional' => [
            'max_employees' => 200,
            'max_users'     => null,
            'features'      => ['attendance', 'leaves', 'payroll', 'performance', 'communication', 'approvals'],
        ],
        'Enterprise' => [
            'max_employees' => null,
            'max_users'     => null,
            'features'      => ['attendance', 'leaves', 'payroll', 'performance', 'communication', 'approvals', 'recruitment'],
        ],
    ],
];
