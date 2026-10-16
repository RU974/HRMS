<?php

namespace Tests\Feature;

use App\Models\Bonus;
use App\Models\Company;
use App\Models\Deduction;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayrollGenerationCoverageTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Department $department;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme Co']);
        $this->grantLicense($this->company, ['payroll']);
        $this->department = Department::create(['name' => 'Ops', 'company_id' => $this->company->id]);
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_PAYROLL_MANAGER, ['company_id' => $this->company->id]));
    }

    private function employee(int $n, array $attrs = [], ?Company $company = null): Employee
    {
        $company ??= $this->company;

        return Employee::create(array_merge([
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id])->id,
            'company_id' => $company->id,
            'name' => "Emp {$n}",
            'email' => "emp{$n}@example.com",
            'employee_number' => "E-{$n}",
            'department_id' => $company->is($this->company)
                ? $this->department->id
                : Department::create(['name' => 'Other', 'company_id' => $company->id])->id,
            'designation' => 'Staff',
            'salary' => 30000,
            'status' => 'active',
            'joining_date' => '2025-01-01',
        ], $attrs));
    }

    private function generate(int $month = 10, int $year = 2026): array
    {
        $this->postJson('/api/v1/payroll/generate', ['month' => $month, 'year' => $year])->assertStatus(202);

        return \App\Models\BackgroundRun::latest('id')->firstOrFail()->summary;
    }

    public function test_salary_is_used_when_basic_salary_was_never_set(): void
    {
        // basic_salary is the decimal default 0.00 (a truthy string); the old "?:" fallback kept it at 0.
        $e = $this->employee(1, ['salary' => 42000]);
        $this->assertEquals(0, (float) $e->fresh()->basic_salary);

        $this->generate();

        $p = Payroll::where('employee_id', $e->id)->firstOrFail();
        $this->assertEquals(42000, (float) $p->base_salary);
        $this->assertEquals(42000, (float) $p->net_salary);
    }

    public function test_basic_salary_wins_over_legacy_salary_and_components_flow_into_net(): void
    {
        $e = $this->employee(2, ['salary' => 99999, 'basic_salary' => 50000]);
        Bonus::create(['employee_id' => $e->id, 'title' => 'Spot', 'amount' => 5000, 'taxable' => false, 'effective_date' => '2026-10-05']);
        Deduction::create(['employee_id' => $e->id, 'title' => 'Fine', 'amount' => 1500, 'type' => 'penalty', 'effective_date' => '2026-10-10']);

        $this->generate();

        $p = Payroll::where('employee_id', $e->id)->firstOrFail();
        $this->assertEquals(50000, (float) $p->base_salary);
        $this->assertEquals(5000, (float) $p->bonus);
        $this->assertEquals(1500, (float) $p->deductions);
        $this->assertEquals(53500, (float) $p->net_salary);
    }

    public function test_everyone_eligible_gets_a_record_and_nobody_else_does(): void
    {
        foreach (range(1, 40) as $n) {
            $this->employee($n);
        }
        $inactive = $this->employee(41, ['status' => 'inactive']);
        $future = $this->employee(42, ['joining_date' => '2026-11-15']);
        $noSalary = $this->employee(43, ['salary' => 0]);
        $foreign = $this->employee(44, [], Company::create(['name' => 'Other Co']));

        $summary = $this->generate();

        $this->assertSame(40, $summary['created']);
        $this->assertSame(1, $summary['no_salary']);
        $this->assertSame(0, $summary['failed']);
        $this->assertSame(40, Payroll::where('month', 10)->where('year', 2026)->count());
        foreach ([$inactive, $future, $noSalary, $foreign] as $left_out) {
            $this->assertFalse(Payroll::where('employee_id', $left_out->id)->exists(), "{$left_out->name} must not get a payroll");
        }
    }

    public function test_someone_who_joined_during_the_period_is_included(): void
    {
        $e = $this->employee(1, ['joining_date' => '2026-10-31']);

        $summary = $this->generate();

        $this->assertSame(1, $summary['created']);
        $this->assertTrue(Payroll::where('employee_id', $e->id)->exists());
    }

    public function test_regenerating_skips_existing_records_without_duplicating(): void
    {
        foreach (range(1, 5) as $n) {
            $this->employee($n);
        }

        $first = $this->generate();
        $second = $this->generate();

        $this->assertSame(5, $first['created']);
        $this->assertSame(0, $second['created']);
        $this->assertSame(5, $second['skipped']);
        $this->assertSame(5, Payroll::count());
    }
}
