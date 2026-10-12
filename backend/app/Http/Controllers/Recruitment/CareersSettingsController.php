<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CareersSettingsController extends Controller
{
    /** Slugs that would collide with other front-end routes. */
    private const RESERVED = ['api', 'auth', 'admin', 'login', 'register', 'settings', 'careers', 'public'];

    private function company(Request $request): Company
    {
        $companyId = $request->user()?->company_id;

        abort_unless($companyId, 422, 'Careers page settings belong to a company. Sign in as a company user.');

        return Company::findOrFail($companyId);
    }

    private function present(Company $company): array
    {
        return [
            'slug' => $company->careers_slug,
            'enabled' => (bool) $company->careers_enabled,
            'intro' => $company->careers_intro,
            'path' => $company->careers_slug ? '/careers/' . $company->careers_slug : null,
            'requisition_approval_required' => (bool) $company->requisition_approval_required,
            // With the "log" or "array" mailer nothing is really delivered: offers, signing codes and consent requests never reach candidates.
            'email_delivery' => ! in_array(config('mail.default'), ['log', 'array'], true),
            'requisition_cost_threshold' => $company->requisition_cost_threshold !== null ? (float) $company->requisition_cost_threshold : null,
            'talent_pool_retention_months' => $company->talent_pool_retention_months,
            'candidate_retention_months' => $company->candidate_retention_months,
            'referral_bonus_amount' => $company->referral_bonus_amount !== null ? (float) $company->referral_bonus_amount : null,
            'referral_bonus_wait_days' => (int) $company->referral_bonus_wait_days,
        ];
    }

    public function show(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok($this->present($this->company($request)));
    }

    public function update(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $company = $this->company($request);

        $validated = $request->validate([
            'slug' => ['sometimes', 'nullable', 'string', 'min:3', 'max:60', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::notIn(self::RESERVED), Rule::unique('companies', 'careers_slug')->ignore($company->id, 'id')],
            'enabled' => 'sometimes|boolean',
            'intro' => 'sometimes|nullable|string|max:2000',
            'requisition_approval_required' => 'sometimes|boolean',
            // Requests costing at least this much need the Company Admin as well as the HR Manager.
            'requisition_cost_threshold' => 'sometimes|nullable|numeric|min:0|max:99999999999',
            // Months a person may stay in the talent pool / months a rejected application is kept. Empty means no limit.
            'talent_pool_retention_months' => 'sometimes|nullable|integer|min:1|max:120',
            'candidate_retention_months' => 'sometimes|nullable|integer|min:1|max:240',
            // Default referral bonus and how long a referred hire must stay before it becomes payable.
            'referral_bonus_amount' => 'sometimes|nullable|numeric|min:0|max:99999999999',
            'referral_bonus_wait_days' => 'sometimes|integer|min:0|max:730',
        ]);

        $slug = array_key_exists('slug', $validated) ? $validated['slug'] : $company->careers_slug;
        $enabled = $validated['enabled'] ?? $company->careers_enabled;

        if ($enabled && ! $slug) {
            return $this->fail('Choose a careers page address before enabling the page.', 422, ['slug' => ['A careers page address is required.']]);
        }

        $company->update([
            'careers_slug' => $slug,
            'careers_enabled' => $enabled,
            'careers_intro' => array_key_exists('intro', $validated) ? $validated['intro'] : $company->careers_intro,
            'requisition_approval_required' => $validated['requisition_approval_required'] ?? $company->requisition_approval_required,
            'requisition_cost_threshold' => array_key_exists('requisition_cost_threshold', $validated) ? $validated['requisition_cost_threshold'] : $company->requisition_cost_threshold,
            'talent_pool_retention_months' => array_key_exists('talent_pool_retention_months', $validated) ? $validated['talent_pool_retention_months'] : $company->talent_pool_retention_months,
            'candidate_retention_months' => array_key_exists('candidate_retention_months', $validated) ? $validated['candidate_retention_months'] : $company->candidate_retention_months,
            'referral_bonus_amount' => array_key_exists('referral_bonus_amount', $validated) ? $validated['referral_bonus_amount'] : $company->referral_bonus_amount,
            'referral_bonus_wait_days' => $validated['referral_bonus_wait_days'] ?? $company->referral_bonus_wait_days,
        ]);

        return $this->ok($this->present($company->fresh()), 'Careers page settings saved');
    }
}
