<?php

namespace App\Services\Recruitment;

use App\Models\Company;
use App\Models\CompanyCurrencyRate;

/**
 * Money on jobs and offers can be in different currencies while a department's budget is set in
 * one. Amounts are converted into the company's base currency with rates the company maintains.
 * An amount in a currency with no rate cannot be converted and is reported, never guessed.
 */
class CurrencyService
{
    /** @var array<string, array{base: string, rates: array<string, float>}> */
    private array $cache = [];

    public function baseCurrency(?string $companyId): string
    {
        return $this->load($companyId)['base'];
    }

    /**
     * @return array{base: string, rates: array<string, float>}
     */
    public function load(?string $companyId): array
    {
        $key = $companyId ?? '';

        if (! isset($this->cache[$key])) {
            $base = $companyId ? (string) (Company::query()->whereKey($companyId)->value('base_currency') ?: 'PKR') : 'PKR';
            $rates = $companyId
                ? CompanyCurrencyRate::query()->where('company_id', $companyId)->pluck('rate', 'currency')->map(fn ($rate) => (float) $rate)->all()
                : [];

            $this->cache[$key] = ['base' => strtoupper($base), 'rates' => array_change_key_case($rates, CASE_UPPER)];
        }

        return $this->cache[$key];
    }

    /** Forget cached rates after they change. */
    public function flush(): void
    {
        $this->cache = [];
    }

    /** True when the currency is the base one, unspecified (assumed base), or has a rate. */
    public function canConvert(?string $companyId, ?string $currency): bool
    {
        return $this->rateFor($companyId, $currency) !== null;
    }

    /** Amount in the company's base currency, or null when the currency has no rate. */
    public function toBase(?string $companyId, float $amount, ?string $currency): ?float
    {
        $rate = $this->rateFor($companyId, $currency);

        return $rate === null ? null : round($amount * $rate, 2);
    }

    private function rateFor(?string $companyId, ?string $currency): ?float
    {
        $data = $this->load($companyId);
        $currency = strtoupper(trim((string) $currency));

        if ($currency === '' || $currency === $data['base']) {
            return 1.0;
        }

        return $data['rates'][$currency] ?? null;
    }
}
