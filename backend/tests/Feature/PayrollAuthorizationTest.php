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
        $employeeUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
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
        $this->postJson('/api/payroll/' . $payroll->id . '/mark-paid')
            ->assertForbidden();
    }

    public function test_payroll_manager_can_mark_payroll_paid(): void
    {
        $manager = User::factory()->create(['role' => User::ROLE_PAYROLL_MANAGER]);
        $employeeUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
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
        $this->postJson('/api/payroll/' . $payroll->id . '/mark-paid')
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');
    }

    public function test_generate_payroll_skips_existing_employee_month_record(): void
    {
        $manager = User::factory()->create(['role' => User::ROLE_PAYROLL_MANAGER]);
        $employeeUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
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

        $this->postJson('/api/payroll/generate', [
            'month' => 5,
            'year' => 2026,
        ])
            ->assertOk()
            ->assertJsonPath('data.created', 0)
            ->assertJsonPath('data.skipped', 1)
            ->assertJsonPath('data.failed', 0);
    }
}
