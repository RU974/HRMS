<?php

return [
    // Number of working days used to compute hourly rate when attendance-based hours unavailable
    'working_days_per_month' => env('PAYROLL_WORKING_DAYS', 22),

    // Overtime pay multiplier
    'overtime_multiplier' => env('PAYROLL_OVERTIME_MULTIPLIER', 1.5),

    // Tax brackets (upper bound => rate)
    // The array is processed in ascending order; last bracket applies to remaining income.
    'tax_brackets' => [
        50000 => 0.0,
        100000 => 0.10,
        200000 => 0.15,
        PHP_INT_MAX => 0.20,
    ],
];
