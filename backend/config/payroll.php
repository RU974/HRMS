<?php

return [
    // Number of working days used to compute hourly rate when attendance-based hours unavailable
    'working_days_per_month' => env('PAYROLL_WORKING_DAYS', 22),

    // Overtime pay multiplier
    'overtime_multiplier' => env('PAYROLL_OVERTIME_MULTIPLIER', 1.5),

    // How attendance affects pay. A company can override these (payroll/attendance-policy).
    'attendance' => [
        'enabled' => env('PAYROLL_ATTENDANCE_ENABLED', true),
        // Days of base salary lost per absent working day.
        'absent_deduction_days' => env('PAYROLL_ABSENT_DEDUCTION_DAYS', 1),
        // Days lost for a half day that is not covered by an approved leave.
        'half_day_deduction_days' => env('PAYROLL_HALF_DAY_DEDUCTION_DAYS', 0.5),
        // Every N late arrivals in a month cost late_deduction_days. 0 disables.
        'lates_per_deduction' => env('PAYROLL_LATES_PER_DEDUCTION', 3),
        'late_deduction_days' => env('PAYROLL_LATE_DEDUCTION_DAYS', 1),
    ],

    // Tax brackets (upper bound => rate)
    // The array is processed in ascending order; last bracket applies to remaining income.
    'tax_brackets' => [
        50000 => 0.0,
        100000 => 0.10,
        200000 => 0.15,
        PHP_INT_MAX => 0.20,
    ],
];
