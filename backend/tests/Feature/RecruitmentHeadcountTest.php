<?php

namespace Tests\Feature;

use App\Models\Approval;
use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\HeadcountBudget;
use App\Models\JobOpening;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentHeadcountTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private User $hrManager;

    private User $admin;

    private User $deptManager;

    private Department $department;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR', 'requisition_approval_required' => true]);
        $this->grantLicense($this->company, ['recruitment', 'approvals']);
        $this->department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $this->admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        $this->deptManager = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $this->company->id]);
    }

    private function budget(int $headcount = 2, ?float $money = 300000): HeadcountBudget
    {
        return HeadcountBudget::create([
            'company_id' => $this->company->id, 'department_id' => $this->department->id, 'fiscal_year' => now()->year,
            'approved_headcount' => $headcount, 'approved_budget' => $money,
        ]);
    }

    private function request(array $overrides = []): array
    {
        Sanctum::actingAs($this->deptManager);

        return $this->postJson('/api/v1/requisitions', array_merge([
            'title' => 'Backend Engineer', 'department_id' => $this->department->id, 'open_positions' => 1,
            'salary_min' => 80000, 'salary_max' => 100000, 'justification' => 'Growth',
        ], $overrides))->assertCreated()->json('data');
    }

    public function test_a_request_within_budget_needs_only_the_hr_manager(): void
    {
        $this->budget(3, 500000);
        $job = $this->request(['open_positions' => 2]);

        $this->assertSame('pending_approval', $job['status']);
        $this->assertFalse($job['budget_check']['requires_executive']);
        $this->assertEquals(200000, $job['estimated_cost']);

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/job-openings/{$job['id']}/approve", [])->assertOk()->assertJsonPath('data.status', 'open');
    }

    public function test_a_request_over_the_approved_headcount_or_cost_also_needs_the_company_admin(): void
    {
        $this->budget(2, 300000);
        $job = $this->request(['open_positions' => 3, 'salary_max' => 120000]);

        $check = $job['budget_check'];
        $this->assertTrue($check['over_headcount']);
        $this->assertTrue($check['over_budget']);
        $this->assertTrue($check['requires_executive']);
        $this->assertSame(2, $check['approved_headcount']);

        // HR says yes first: the job is still not live and the Company Admin is asked for the final decision.
        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/job-openings/{$job['id']}/approve", [])->assertOk()->assertJsonPath('data.status', 'pending_approval');
        $this->assertDatabaseHas('notifications', ['user_id' => $this->admin->id, 'title' => 'Final approval needed: Backend Engineer']);
        $this->assertSame(1, Approval::where('module', JobOpening::APPROVAL_MODULE)->where('status', 'pending')->count());

        // The HR Manager cannot give the final approval; the Company Admin can.
        $this->postJson("/api/v1/job-openings/{$job['id']}/approve", [])->assertForbidden();
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/v1/job-openings/{$job['id']}/approve", [])->assertOk()->assertJsonPath('data.status', 'open');
        $this->assertNotNull(JobOpening::find($job['id'])->posted_at);
    }

    public function test_the_company_admin_can_reject_an_over_budget_request_at_the_final_step(): void
    {
        $this->budget(1, null);
        $job = $this->request(['open_positions' => 2]);

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/job-openings/{$job['id']}/approve", [])->assertOk();

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/v1/job-openings/{$job['id']}/reject", ['notes' => 'Not this year'])->assertOk()->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.approval_note', 'Not this year');
    }

    public function test_an_expensive_role_is_escalated_even_without_a_department_budget(): void
    {
        $this->company->update(['requisition_cost_threshold' => 150000]);

        $cheap = $this->request(['salary_max' => 100000]);
        $this->assertFalse($cheap['budget_check']['requires_executive']);
        $this->assertFalse($cheap['budget_check']['has_budget']);

        $expensive = $this->request(['title' => 'Principal Engineer', 'salary_max' => 150000]);
        $this->assertTrue($expensive['budget_check']['high_cost']);
        $this->assertTrue($expensive['budget_check']['requires_executive']);

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/job-openings/{$expensive['id']}/approve", [])->assertOk()->assertJsonPath('data.status', 'pending_approval');
        $this->postJson("/api/v1/job-openings/{$cheap['id']}/approve", [])->assertOk()->assertJsonPath('data.status', 'open');
    }

    public function test_usage_counts_hires_this_year_and_open_slots(): void
    {
        $this->budget(5, 1000000);

        $open = JobOpening::create(['title' => 'Open role', 'company_id' => $this->company->id, 'department_id' => $this->department->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 2, 'salary_max' => 100000]);
        $filled = JobOpening::create(['title' => 'Filled role', 'company_id' => $this->company->id, 'department_id' => $this->department->id, 'employment_type' => 'full_time', 'status' => 'closed', 'open_positions' => 1, 'salary_max' => 90000]);
        $hire = Candidate::create(['job_opening_id' => $filled->id, 'company_id' => $this->company->id, 'full_name' => 'Hired Person', 'email' => 'hired@example.com', 'stage' => 'hired']);
        \App\Models\CandidateStageHistory::create(['company_id' => $this->company->id, 'candidate_id' => $hire->id, 'from_stage' => 'offer', 'to_stage' => 'hired']);
        \App\Models\Offer::create(['company_id' => $this->company->id, 'candidate_id' => $hire->id, 'salary' => 90000, 'status' => 'accepted']);

        Sanctum::actingAs($this->recruiter);
        $row = $this->getJson('/api/v1/recruitment/headcount')->assertOk()->json('data.budgets.0');

        $this->assertSame(1, $row['hired']);
        $this->assertSame(2, $row['open_slots']);
        $this->assertSame(3, $row['used_headcount']);
        $this->assertSame(2, $row['remaining_headcount']);
        $this->assertEquals(290000, $row['used_cost']); // 90k hire + 2 x 100k open
        $this->assertEquals(710000, $row['remaining_budget']);
        $this->assertFalse($row['over']);

        // A job in the same department is judged against what is left.
        $check = $this->postJson('/api/v1/requisitions/budget-check', ['department_id' => $this->department->id, 'open_positions' => 3, 'salary_max' => 100000])->assertOk()->json('data');
        $this->assertTrue($check['over_headcount']);
        $this->assertFalse($check['over_budget']);
        $this->assertSame(3, $check['used_headcount']);
    }

    public function test_budgets_are_managed_by_settings_admins_and_stay_inside_the_company(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $foreignDepartment = Department::create(['name' => 'Foreign', 'company_id' => $other->id]);

        Sanctum::actingAs($this->hrManager);
        $this->putJson('/api/v1/recruitment/headcount', ['department_id' => $this->department->id, 'fiscal_year' => 2027, 'approved_headcount' => 4])->assertForbidden();

        Sanctum::actingAs($this->recruiter);
        $this->putJson('/api/v1/recruitment/headcount', ['department_id' => $foreignDepartment->id, 'fiscal_year' => 2027, 'approved_headcount' => 4])->assertStatus(422)->assertJsonValidationErrors('department_id');
        $this->putJson('/api/v1/recruitment/headcount', ['department_id' => $this->department->id, 'fiscal_year' => 2027, 'approved_headcount' => 4, 'approved_budget' => 800000])->assertOk();
        $id = $this->putJson('/api/v1/recruitment/headcount', ['department_id' => $this->department->id, 'fiscal_year' => 2027, 'approved_headcount' => 6])->assertOk()->json('data.id');

        $this->assertSame(1, HeadcountBudget::where('department_id', $this->department->id)->where('fiscal_year', 2027)->count());
        $this->assertSame(6, HeadcountBudget::find($id)->approved_headcount);
        $this->getJson('/api/v1/recruitment/headcount?year=2027')->assertJsonPath('data.budgets.0.approved_headcount', 6);

        $this->deleteJson("/api/v1/recruitment/headcount/{$id}")->assertOk();
        $this->assertNull(HeadcountBudget::find($id));
    }

    public function test_other_currencies_are_converted_with_the_companys_own_rates(): void
    {
        $this->budget(5, 500000); // budgets are in the base currency (PKR by default)

        Sanctum::actingAs($this->hrManager);
        $this->putJson('/api/v1/recruitment/currency', ['base_currency' => 'PKR', 'rates' => [['currency' => 'USD', 'rate' => 280]]])->assertForbidden();

        Sanctum::actingAs($this->recruiter);
        $this->putJson('/api/v1/recruitment/currency', ['base_currency' => 'pkr', 'rates' => [['currency' => 'usd', 'rate' => 280], ['currency' => 'USD', 'rate' => 300]]])
            ->assertStatus(422);
        $this->putJson('/api/v1/recruitment/currency', ['base_currency' => 'pkr', 'rates' => [['currency' => 'usd', 'rate' => 280], ['currency' => 'PKR', 'rate' => 5]]])
            ->assertOk()
            ->assertJsonPath('data.base_currency', 'PKR')
            ->assertJsonCount(1, 'data.rates')
            ->assertJsonPath('data.rates.0.currency', 'USD');
        $this->getJson('/api/v1/recruitment/currency')->assertOk()->assertJsonPath('data.rates.0.rate', 280);

        // 2 positions at 1,000 USD = 560,000 PKR: over the 500,000 budget although "1,000" looks small.
        $check = $this->postJson('/api/v1/requisitions/budget-check', [
            'department_id' => $this->department->id, 'open_positions' => 2, 'salary_max' => 1000,
        ])->assertOk()->json('data');
        $this->assertSame('PKR', $check['currency']);
        $this->assertEquals(2000, $check['estimated_cost']); // no currency given, so the amount is taken as PKR

        $job = JobOpening::create([
            'title' => 'USD role', 'company_id' => $this->company->id, 'department_id' => $this->department->id, 'employment_type' => 'full_time',
            'status' => 'pending_approval', 'open_positions' => 2, 'salary_max' => 1000, 'salary_currency' => 'USD',
        ]);
        $inUsd = app(\App\Services\Recruitment\HeadcountService::class)->check($job);
        $this->assertEquals(560000, $inUsd['estimated_cost']);
        $this->assertTrue($inUsd['over_budget']);
        $this->assertSame([], $inUsd['unconverted_currencies']);
    }

    public function test_a_currency_without_a_rate_is_reported_and_escalated_instead_of_guessed(): void
    {
        $this->budget(5, 500000);
        $job = JobOpening::create([
            'title' => 'EUR role', 'company_id' => $this->company->id, 'department_id' => $this->department->id, 'employment_type' => 'full_time',
            'status' => 'pending_approval', 'open_positions' => 1, 'salary_max' => 100, 'salary_currency' => 'EUR',
        ]);

        $check = app(\App\Services\Recruitment\HeadcountService::class)->check($job);

        $this->assertSame(['EUR'], $check['unconverted_currencies']);
        $this->assertTrue($check['requires_executive']);
        $this->assertEquals(0, $check['estimated_cost']);

        // Jobs already open in an unconvertible currency are listed on the budget summary, not silently counted as zero.
        Sanctum::actingAs($this->recruiter);
        $job->update(['status' => 'open']);
        $this->getJson('/api/v1/recruitment/headcount')->assertOk()->assertJsonPath('data.budgets.0.unconverted_currencies.0', 'EUR');
    }

    public function test_accepted_offers_in_other_currencies_count_towards_the_budget_once_converted(): void
    {
        $this->budget(5, 1000000);
        \App\Models\CompanyCurrencyRate::create(['company_id' => $this->company->id, 'currency' => 'USD', 'rate' => 280]);

        $filled = JobOpening::create(['title' => 'Filled', 'company_id' => $this->company->id, 'department_id' => $this->department->id, 'employment_type' => 'full_time', 'status' => 'closed', 'open_positions' => 1]);
        $hire = Candidate::create(['job_opening_id' => $filled->id, 'company_id' => $this->company->id, 'full_name' => 'Hired', 'email' => 'h@example.com', 'stage' => 'hired']);
        \App\Models\CandidateStageHistory::create(['company_id' => $this->company->id, 'candidate_id' => $hire->id, 'from_stage' => 'offer', 'to_stage' => 'hired']);
        \App\Models\Offer::create(['company_id' => $this->company->id, 'candidate_id' => $hire->id, 'salary' => 1000, 'currency' => 'USD', 'status' => 'accepted']);

        Sanctum::actingAs($this->recruiter);
        $this->getJson('/api/v1/recruitment/headcount')->assertOk()->assertJsonPath('data.budgets.0.used_cost', 280000);
    }

    public function test_careers_settings_carry_the_cost_threshold_and_retention_periods(): void
    {
        Sanctum::actingAs($this->recruiter);

        $this->putJson('/api/v1/recruitment/careers-settings', [
            'requisition_cost_threshold' => 250000, 'talent_pool_retention_months' => 6, 'candidate_retention_months' => 24,
        ])->assertOk()
            ->assertJsonPath('data.requisition_cost_threshold', 250000)
            ->assertJsonPath('data.talent_pool_retention_months', 6)
            ->assertJsonPath('data.candidate_retention_months', 24);

        $this->putJson('/api/v1/recruitment/careers-settings', ['candidate_retention_months' => null, 'talent_pool_retention_months' => 0])->assertStatus(422);
        $this->putJson('/api/v1/recruitment/careers-settings', ['candidate_retention_months' => null])->assertOk()->assertJsonPath('data.candidate_retention_months', null);
    }
}
