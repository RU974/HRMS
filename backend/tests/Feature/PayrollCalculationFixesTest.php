<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Deduction;
use App\Models\Department;
use App\Models\Employee;
use App\Models\License;
use App\Models\LoanAdvance;
use App\Models\Payroll;
use App\Models\SalaryIncrement;
use App\Models\TaxBracket;
use App\Models\User;
use App\Services\PayrollCalculator;
use App\Services\TaxCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayrollCalculationFixesTest extends TestCase
{
    use RefreshDatabase;

    private function makeCompanyAndManager(): array
    {
        $company = Company::create(['name' => 'Acme Co']);
        License::create([
            'company_id' => $company->id,
            'license_key' => License::generateKey(),
            'product' => 'HRMS',
            'edition' => 'professional',
            'licensee_name' => 'Acme Co',
            'licensee_email' => 'license@acme.test',
            'status' => 'active',
            'activated_at' => now(),
            'is_active' => true,
            'features' => ['payroll'],
        ]);
        $manager = $this->createUserWithRole(User::ROLE_PAYROLL_MANAGER, ['company_id' => $company->id]);
        $department = Department::create(['name' => 'Ops']);

        return [$company, $manager, $department];
    }

    private function makeEmployee(Company $company, Department $department, array $overrides = []): Employee
    {
        static $n = 0;
        $n++;
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $company->id,
            'email' => "emp{$n}@acme.test",
        ]);

        return Employee::create(array_merge([
            'user_id' => $user->id,
            'company_id' => $company->id,
            'name' => "Employee {$n}",
            'email' => "emp{$n}@acme.test",
            'department_id' => $department->id,
            'designation' => 'Staff',
            'salary' => 0,
            'basic_salary' => 0,
            'allowances' => 0,
            'status' => 'active',
        ], $overrides));
    }

    public function test_basic_salary_falls_back_to_legacy_salary_column_when_zero(): void
    {
        [$company, , $department] = $this->makeCompanyAndManager();

        // Simulates an employee created before basic_salary existed: only the
        // legacy `salary` column is populated, basic_salary sits at its 0 default.
        $employee = $this->makeEmployee($company, $department, [
            'salary' => 5000,
            'basic_salary' => 0,
            'allowances' => 0,
        ]);

        $components = (new PayrollCalculator())->calculateForEmployee($employee, 6, 2026);

        $this->assertSame(5000.0, $components['base_salary']);
    }

    public function test_tax_calculator_uses_database_brackets_not_config(): void
    {
        [$company, , ] = $this->makeCompanyAndManager();

        TaxBracket::create(['company_id' => $company->id, 'name' => 'flat', 'min_income' => 0, 'max_income' => null, 'rate' => 5, 'sort_order' => 1]);

        // Config brackets would give a much larger tax for 100,000; the
        // company-specific 5% flat bracket must win instead.
        config(['payroll.tax_brackets' => [50000 => 0.0, PHP_INT_MAX => 0.5]]);

        $tax = (new TaxCalculator())->calculate(100000, $company->id);

        $this->assertSame(5000.0, $tax);
    }

    public function test_tax_calculator_falls_back_to_global_brackets_when_company_has_none(): void
    {
        // Replace the seeded production defaults with a single, deterministic
        // global bracket for this assertion.
        TaxBracket::whereNull('company_id')->delete();
        TaxBracket::create(['company_id' => null, 'name' => 'global flat', 'min_income' => 0, 'max_income' => null, 'rate' => 10, 'sort_order' => 1]);

        $tax = (new TaxCalculator())->calculate(1000, 'some-other-company-id');

        $this->assertSame(100.0, $tax);
    }

    public function test_store_computes_net_salary_from_components_ignoring_client_value(): void
    {
        [$company, $manager, $department] = $this->makeCompanyAndManager();
        $employee = $this->makeEmployee($company, $department);

        Sanctum::actingAs($manager);

        $response = $this->postJson('/api/v1/payroll', [
            'employee_id' => $employee->id,
            'month' => 6,
            'year' => 2026,
            'base_salary' => 1000,
            'allowances' => 100,
            'bonus' => 50,
            'deductions' => 30,
            'tax' => 20,
            'net_salary' => 999999, // deliberately wrong — must be ignored
        ])->assertCreated();

        $this->assertEquals(1100.0, (float) $response->json('data.net_salary'));
    }

    public function test_update_is_rejected_once_payroll_is_no_longer_draft(): void
    {
        [$company, $manager, $department] = $this->makeCompanyAndManager();
        $employee = $this->makeEmployee($company, $department);

        $payroll = Payroll::create([
            'employee_id' => $employee->id,
            'month' => 6,
            'year' => 2026,
            'base_salary' => 1000,
            'bonus' => 0,
            'deductions' => 0,
            'tax' => 0,
            'net_salary' => 1000,
            'status' => Payroll::STATUS_APPROVED,
        ]);

        Sanctum::actingAs($manager);

        $this->putJson("/api/v1/payroll/{$payroll->id}", ['base_salary' => 5000])
            ->assertStatus(422);

        $this->assertSame(1000.0, (float) $payroll->fresh()->base_salary);
    }

    public function test_approve_stamps_approver_and_reject_returns_to_draft(): void
    {
        [$company, $manager, $department] = $this->makeCompanyAndManager();
        $employee = $this->makeEmployee($company, $department);

        $payroll = Payroll::create([
            'employee_id' => $employee->id,
            'month' => 6,
            'year' => 2026,
            'base_salary' => 1000,
            'bonus' => 0,
            'deductions' => 0,
            'tax' => 0,
            'net_salary' => 1000,
            'status' => Payroll::STATUS_DRAFT,
        ]);

        Sanctum::actingAs($manager);

        $this->postJson("/api/v1/payroll/{$payroll->id}/approve")->assertOk();
        $payroll->refresh();
        $this->assertSame(Payroll::STATUS_REVIEWED, $payroll->status);

        $this->postJson("/api/v1/payroll/{$payroll->id}/approve")->assertOk();
        $payroll->refresh();
        $this->assertSame(Payroll::STATUS_APPROVED, $payroll->status);
        $this->assertSame($manager->id, $payroll->approved_by);
        $this->assertNotNull($payroll->approved_at);

        // Approved payrolls cannot be rejected — only reviewed/pending can.
        $this->postJson("/api/v1/payroll/{$payroll->id}/reject", ['reason' => 'test'])
            ->assertStatus(422);
    }

    public function test_generate_payroll_auto_creates_loan_emi_deduction_and_pays_down_balance(): void
    {
        [$company, $manager, $department] = $this->makeCompanyAndManager();
        $employee = $this->makeEmployee($company, $department, ['salary' => 2000, 'basic_salary' => 2000]);

        $loan = LoanAdvance::create([
            'employee_id' => $employee->id,
            'company_id' => $company->id,
            'title' => 'Emergency advance',
            'amount' => 600,
            'outstanding_balance' => 600,
            'emi_amount' => 200,
            'start_date' => '2026-01-01',
            'status' => 'active',
        ]);

        Sanctum::actingAs($manager);

        // dispatchSync means generation has already completed synchronously
        // by the time this request returns (202 = accepted background_run_id).
        $this->postJson('/api/v1/payroll/generate', ['month' => 6, 'year' => 2026])
            ->assertStatus(202);

        $loan->refresh();
        $this->assertSame(400.0, $loan->outstanding_balance);
        $this->assertSame('active', $loan->status);

        $deduction = Deduction::where('loan_advance_id', $loan->id)->first();
        $this->assertNotNull($deduction);
        $this->assertSame(200.0, (float) $deduction->amount);

        $payroll = Payroll::where('employee_id', $employee->id)->first();
        $this->assertNotNull($payroll);
        $this->assertSame($payroll->id, $deduction->payroll_id);
        $this->assertSame(200.0, (float) $payroll->deductions);
    }

    public function test_salary_increment_updates_employee_basic_salary(): void
    {
        [$company, $manager, $department] = $this->makeCompanyAndManager();
        $employee = $this->makeEmployee($company, $department, ['salary' => 1000, 'basic_salary' => 1000]);

        Sanctum::actingAs($manager);

        $this->postJson('/api/v1/salary-increments', [
            'employee_id' => $employee->id,
            'effective_date' => '2026-06-01',
            'old_salary' => 1000,
            'new_salary' => 1500,
        ])->assertCreated();

        $employee->refresh();
        $this->assertSame(1500.0, (float) $employee->basic_salary);
    }
}
