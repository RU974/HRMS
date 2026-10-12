<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Department;
use App\Models\HeadcountBudget;
use App\Models\JobOpening;
use App\Models\Company;
use App\Models\CompanyCurrencyRate;
use App\Services\Recruitment\CurrencyService;
use App\Services\Recruitment\HeadcountService;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Approved headcount and new-hire budget per department and year, and how much of it is used. */
class HeadcountBudgetController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly HeadcountService $headcount, private readonly CurrencyService $currencies)
    {
    }

    private function companyId(Request $request): string
    {
        $companyId = $request->user()?->company_id;

        abort_unless($companyId, 422, 'Headcount budgets belong to a company. Sign in as a company user.');

        return (string) $companyId;
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $year = (int) $request->input('year', now()->year);

        return $this->ok([
            'year' => $year,
            'currency' => $this->currencies->baseCurrency($this->companyId($request)),
            'budgets' => $this->headcount->summary($this->companyId($request), $year),
        ]);
    }

    /** The currency budgets are set in, and the rates used to convert other currencies into it. */
    public function currency(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok($this->presentCurrency($this->companyId($request)));
    }

    public function saveCurrency(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');
        $companyId = $this->companyId($request);

        $validated = $request->validate([
            'base_currency' => 'required|string|alpha|min:2|max:10',
            'rates' => 'present|array|max:50',
            'rates.*.currency' => 'required|string|alpha|min:2|max:10|distinct:ignore_case',
            'rates.*.rate' => 'required|numeric|gt:0|max:1000000000',
        ]);

        $base = strtoupper($validated['base_currency']);
        $rates = collect($validated['rates'])
            ->map(fn ($row) => ['currency' => strtoupper($row['currency']), 'rate' => (float) $row['rate']])
            ->reject(fn ($row) => $row['currency'] === $base);

        DB::transaction(function () use ($companyId, $base, $rates) {
            Company::query()->whereKey($companyId)->update(['base_currency' => $base]);
            CompanyCurrencyRate::query()->where('company_id', $companyId)->whereNotIn('currency', $rates->pluck('currency')->all())->delete();

            foreach ($rates as $row) {
                CompanyCurrencyRate::query()->updateOrCreate(['company_id' => $companyId, 'currency' => $row['currency']], ['rate' => $row['rate']]);
            }
        });

        $this->currencies->flush();

        return $this->ok($this->presentCurrency($companyId), 'Currency settings saved');
    }

    /** @return array{base_currency: string, rates: array<int, array{currency: string, rate: float}>} */
    private function presentCurrency(string $companyId): array
    {
        $data = $this->currencies->load($companyId);

        return [
            'base_currency' => $data['base'],
            'rates' => collect($data['rates'])->map(fn ($rate, $currency) => ['currency' => $currency, 'rate' => $rate])->sortBy('currency')->values()->all(),
        ];
    }

    /** Create or replace a department's budget for a year. */
    public function upsert(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');
        $companyId = $this->companyId($request);

        $validated = $request->validate([
            'department_id' => ['required', Rule::exists('departments', 'id')->where('company_id', $companyId)->whereNull('deleted_at')],
            'fiscal_year' => 'required|integer|min:2000|max:2100',
            'approved_headcount' => 'required|integer|min:0|max:100000',
            'approved_budget' => 'nullable|numeric|min:0|max:99999999999',
        ]);

        $budget = HeadcountBudget::query()->updateOrCreate(
            ['department_id' => $validated['department_id'], 'fiscal_year' => $validated['fiscal_year']],
            ['company_id' => $companyId, 'approved_headcount' => $validated['approved_headcount'], 'approved_budget' => $validated['approved_budget'] ?? null]
        );

        return $this->ok($budget->load('department:id,name'), 'Headcount budget saved');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $this->resolveTenantModel(HeadcountBudget::class, $id)->delete();

        return $this->ok(null, 'Headcount budget removed');
    }

    /** What a role would do to its department's budget, before it is saved or submitted. */
    public function check(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:request', 'recruitment:create', 'recruitment:edit']);
        $companyId = $this->companyId($request);

        $validated = $request->validate([
            'department_id' => ['nullable', Rule::exists('departments', 'id')->where('company_id', $companyId)->whereNull('deleted_at')],
            'open_positions' => 'nullable|integer|min:1|max:1000',
            'salary_min' => 'nullable|numeric|min:0',
            'salary_max' => 'nullable|numeric|min:0',
            'job_id' => 'nullable|integer',
        ]);

        $job = ! empty($validated['job_id'])
            ? $this->resolveTenantModel(JobOpening::class, $validated['job_id'])
            : new JobOpening(['company_id' => $companyId]);

        $job->fill(array_filter([
            'department_id' => $validated['department_id'] ?? null,
            'open_positions' => $validated['open_positions'] ?? null,
            'salary_min' => $validated['salary_min'] ?? null,
            'salary_max' => $validated['salary_max'] ?? null,
        ], fn ($value) => $value !== null));

        if (! $job->open_positions) {
            $job->open_positions = 1;
        }

        return $this->ok($this->headcount->check($job));
    }

    /** Departments the company can set a budget for. */
    public function departments(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok(Department::query()->where('company_id', $this->companyId($request))->orderBy('name')->get(['id', 'name']));
    }
}
