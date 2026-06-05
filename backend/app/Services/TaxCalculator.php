<?php

namespace App\Services;

class TaxCalculator
{
    /**
     * Calculate tax using configured progressive brackets.
     *
     * @param float $amount
     * @return float
     */
    public function calculate(float $amount): float
    {
        if ($amount <= 0) {
            return 0.0;
        }

        $brackets = config('payroll.tax_brackets', []);
        ksort($brackets);

        $remaining = $amount;
        $lower = 0;
        $tax = 0.0;

        foreach ($brackets as $upper => $rate) {
            $slice = min($remaining, max(0, $upper - $lower));
            if ($slice <= 0) {
                $lower = $upper;
                continue;
            }
            $tax += $slice * $rate;
            $remaining -= $slice;
            $lower = $upper;
            if ($remaining <= 0) {
                break;
            }
        }

        return round($tax, 2);
    }
}
