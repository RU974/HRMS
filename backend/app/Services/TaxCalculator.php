<?php

namespace App\Services;

use App\Models\TaxBracket;

class TaxCalculator
{
    /**
     * Calculate tax using progressive brackets stored in tax_brackets.
     *
     * Company-specific brackets (tax_brackets.company_id = $companyId) take
     * priority; if the company has none configured, falls back to the
     * global brackets (company_id null). If literally no brackets exist in
     * the database at all, falls back to config('payroll.tax_brackets') as
     * a last-resort safety net so payroll generation never silently applies
     * zero tax due to an empty table.
     *
     * @param float $amount
     * @param int|string|null $companyId
     * @return float
     */
    public function calculate(float $amount, int|string|null $companyId = null): float
    {
        if ($amount <= 0) {
            return 0.0;
        }

        $brackets = $this->resolveBrackets($companyId);

        if ($brackets->isEmpty()) {
            return $this->calculateFromConfig($amount);
        }

        $remaining = $amount;
        $tax = 0.0;

        foreach ($brackets as $bracket) {
            $lower = (float) $bracket->min_income;
            $upper = $bracket->max_income !== null ? (float) $bracket->max_income : PHP_FLOAT_MAX;
            $width = max(0, $upper - $lower);

            if ($remaining <= 0) {
                break;
            }

            $slice = min($remaining, $width);
            if ($slice <= 0) {
                continue;
            }

            $tax += $slice * ((float) $bracket->rate / 100);
            $remaining -= $slice;
        }

        return round($tax, 2);
    }

    /**
     * @return \Illuminate\Support\Collection<int, TaxBracket>
     */
    private function resolveBrackets(int|string|null $companyId)
    {
        if ($companyId !== null) {
            $companySpecific = TaxBracket::where('company_id', $companyId)
                ->orderBy('min_income')
                ->get();

            if ($companySpecific->isNotEmpty()) {
                return $companySpecific;
            }
        }

        return TaxBracket::whereNull('company_id')
            ->orderBy('min_income')
            ->get();
    }

    private function calculateFromConfig(float $amount): float
    {
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
