<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayrollAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_cannot_mark_payroll_paid(): void
    {
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'name' => 'Payroll Emp',
            'email' => 'payroll.emp@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $payroll = Payroll::create([
            'employee_id' => $employee->id,
            'month' => '5',
            'year' => 2026,
            'base_salary' => 1200,
            'bonus' => 0,
            'deductions' => 0,
            'tax' => 0,
            'net_salary' => 1200,
            'payment_date' => '2026-05-31',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($employeeUser);
        $this->postJson('/api/v1/payroll/' . $payroll->id . '/mark-paid')
            ->assertForbidden();
    }

    public function test_payroll_manager_can_mark_payroll_paid(): void
    {
        $manager = $this->createUserWithRole(User::ROLE_PAYROLL_MANAGER);
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'name' => 'Payroll Emp 2',
            'email' => 'payroll.emp2@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1500,
            'status' => 'active',
        ]);

        $payroll = Payroll::create([
            'employee_id' => $employee->id,
            'month' => '5',
            'year' => 2026,
            'base_salary' => 1500,
            'bonus' => 0,
            'deductions' => 0,
            'tax' => 0,
            'net_salary' => 1500,
            'payment_date' => '2026-05-31',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($manager);
        $this->postJson('/api/v1/payroll/' . $payroll->id . '/mark-paid')
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');
    }

    public function test_generate_payroll_skips_existing_employee_month_record(): void
    {
        $company = \App\Models\Company::create(['name' => 'Payroll Co']);
        $this->grantLicense($company, ['payroll']);
        $manager = $this->createUserWithRole(User::ROLE_PAYROLL_MANAGER, ['company_id' => $company->id]);
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id]);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'company_id' => $company->id,
            'name' => 'Payroll Emp 3',
            'email' => 'payroll.emp3@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1500,
            'status' => 'active',
        ]);

        Payroll::create([
            'employee_id' => $employee->id,
            'month' => 5,
            'year' => 2026,
            'base_salary' => 1500,
            'bonus' => 0,
            'deductions' => 0,
            'tax' => 0,
            'net_salary' => 1500,
            'payment_date' => '2026-05-31',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($manager);

        // Generation runs as a tracked background run; its summary reports what happened.
        $runId = $this->postJson('/api/v1/payroll/generate', [
            'month' => 5,
            'year' => 2026,
        ])
            ->assertStatus(202)
            ->json('data.background_run_id');

        $this->getJson("/api/v1/background-runs/{$runId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'done')
            ->assertJsonPath('data.summary.created', 0)
            ->assertJsonPath('data.summary.skipped', 1)
            ->assertJsonPath('data.summary.failed', 0);
    }
}


