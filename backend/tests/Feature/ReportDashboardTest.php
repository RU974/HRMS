<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_reports_endpoints_return_counts_for_valid_input(): void
    {
        $user = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        $department = Department::create(['name' => 'Operations']);
        $employee = Employee::create([
            'user_id' => $user->id,
            'name' => 'Test Employee',
            'email' => 'report.employee@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1500,
            'status' => 'active',
        ]);

        Attendance::create([
            'employee_id' => $employee->id,
            'date' => '2026-05-15',
            'check_in' => '2026-05-15 09:00:00',
            'status' => 'present',
        ]);

        Leave::create([
            'employee_id' => $employee->id,
            'type' => 'vacation',
            'from_date' => '2026-05-10',
            'to_date' => '2026-05-12',
            'status' => 'approved',
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

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/reports/employees')
            ->assertOk()
            ->assertJsonStructure(['success', 'message', 'data'])
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/reports/attendance?month=5&year=2026')
            ->assertOk()
            ->assertJsonStructure(['success', 'message', 'data'])
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/reports/leave?month=5&year=2026')
            ->assertOk()
            ->assertJsonStructure(['success', 'message', 'data'])
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/reports/payroll?month=5&year=2026')
            ->assertOk()
            ->assertJsonStructure(['success', 'message', 'data'])
            ->assertJsonCount(1, 'data');
    }

    public function test_report_endpoints_validate_month_and_year(): void
    {
        $user = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/reports/attendance?month=13&year=1999')->assertStatus(422);
        $this->getJson('/api/v1/reports/leave?month=13&year=1999')->assertStatus(422);
        $this->getJson('/api/v1/reports/payroll?month=13&year=1999')->assertStatus(422);
    }

    public function test_dashboard_summary_returns_expected_structure(): void
    {
        $user = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        $department = Department::create(['name' => 'Operations']);
        $employee = Employee::create([
            'user_id' => $user->id,
            'name' => 'Summary Employee',
            'email' => 'summary.employee@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1500,
            'status' => 'active',
        ]);

        Leave::create([
            'employee_id' => $employee->id,
            'type' => 'sick',
            'from_date' => '2026-05-10',
            'to_date' => '2026-05-12',
            'status' => 'pending',
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

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/summary?month=5&year=2026')
            ->assertOk()
            ->assertJsonPath('data.month', '5')
            ->assertJsonPath('data.year', '2026')
            ->assertJsonStructure(['success', 'message', 'data']);
    }

    public function test_dashboard_summary_validates_month_and_year(): void
    {
        $user = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/summary?month=13&year=1999')
            ->assertStatus(422);
    }
}


