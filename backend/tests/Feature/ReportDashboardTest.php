<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Company;
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

    public function test_analytics_endpoint_returns_extended_metrics(): void
    {
        $user = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        $department = Department::create(['name' => 'Operations']);
        $employee = Employee::create([
            'user_id' => $user->id,
            'name' => 'Analytics Employee',
            'email' => 'analytics.employee@example.com',
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

        $this->getJson('/api/v1/reports/analytics?month=5&year=2026')
            ->assertOk()
            ->assertJsonPath('data.attendance_present', 1)
            ->assertJsonPath('data.payroll_total_amount', 1500)
            ->assertJsonPath('data.attendance_rate', 100)
            ->assertJsonStructure(['success', 'message', 'data' => ['employees', 'active_employees', 'attendance_present', 'attendance_rate', 'payroll_total_amount', 'payroll_status_breakdown']]);
    }

    public function test_report_endpoints_support_export_formats(): void
    {
        $user = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        $department = Department::create(['name' => 'Operations']);
        $employee = Employee::create([
            'user_id' => $user->id,
            'name' => 'Export Employee',
            'email' => 'export.employee@example.com',
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

        $this->get('/api/v1/reports/payroll?month=5&year=2026&format=csv')
            ->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $this->get('/api/v1/reports/attendance?month=5&year=2026&format=excel')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.ms-excel; charset=UTF-8');

        $this->get('/api/v1/reports/analytics?month=5&year=2026&format=pdf')
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_report_managers_cannot_modify_reports_belonging_to_other_companies(): void
    {
        $companyA = Company::create(['name' => 'Company A']);
        $companyB = Company::create(['name' => 'Company B']);

        $reportOwner = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $companyA->id]);
        $report = \App\Models\Report::create([
            'name' => 'Company A Report',
            'type' => 'employee',
            'description' => 'Company report',
            'status' => 'active',
            'filters' => [],
            'created_by' => $reportOwner->id,
            'updated_by' => $reportOwner->id,
        ]);

        $otherManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $companyB->id]);
        Sanctum::actingAs($otherManager);

        $this->putJson('/api/v1/reports/' . $report->id, ['name' => 'Unauthorized Update'])
            ->assertForbidden();

        $this->deleteJson('/api/v1/reports/' . $report->id)
            ->assertForbidden();
    }

    public function test_attendance_detail_report_breaks_down_by_employee_department_and_day(): void
    {
        $company = Company::create(['name' => 'Detail Co']);
        $other = Company::create(['name' => 'Other Co']);
        $manager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $company->id]);

        $make = function (string $name, string $dept, Company $co) {
            $user = User::factory()->create(['company_id' => $co->id]);

            return Employee::create([
                'user_id' => $user->id,
                'company_id' => $co->id,
                'name' => $name,
                'email' => strtolower($name) . '@example.com',
                'department_id' => Department::create(['name' => $dept, 'company_id' => $co->id])->id,
                'designation' => 'Analyst',
                'salary' => 1000,
                'status' => 'active',
            ]);
        };

        $ann = $make('Ann', 'Sales', $company);
        $bob = $make('Bob', 'Support', $company);
        $outsider = $make('Zed', 'Sales', $other);

        Attendance::create(['employee_id' => $ann->id, 'date' => '2026-05-04', 'check_in' => '2026-05-04 09:00:00', 'check_out' => '2026-05-04 17:00:00', 'status' => 'present']);
        Attendance::create(['employee_id' => $ann->id, 'date' => '2026-05-05', 'check_in' => '2026-05-05 09:30:00', 'check_out' => '2026-05-05 17:30:00', 'status' => 'late']);
        Attendance::create(['employee_id' => $bob->id, 'date' => '2026-05-04', 'status' => 'absent']);
        Attendance::create(['employee_id' => $outsider->id, 'date' => '2026-05-04', 'check_in' => '2026-05-04 09:00:00', 'check_out' => '2026-05-04 17:00:00', 'status' => 'present']);

        Sanctum::actingAs($manager);

        $response = $this->getJson('/api/v1/reports/attendance/detail?month=5&year=2026')
            ->assertOk()
            ->assertJsonPath('data.days_in_month', 31)
            ->assertJsonCount(2, 'data.employees')
            ->assertJsonCount(2, 'data.departments');

        $rows = collect($response->json('data.employees'))->keyBy('name');
        $this->assertSame(16.0, (float) $rows['Ann']['hours_worked']);
        $this->assertSame(1, $rows['Ann']['late']);
        $this->assertSame(1, $rows['Ann']['late_count']);
        $this->assertSame(1, $rows['Bob']['absent']);
        $this->assertSame('present', $rows['Ann']['days']['4']['status']);
        $this->assertArrayNotHasKey('Zed', $rows->all());

        $dept = collect($response->json('data.departments'))->keyBy('department');
        $this->assertSame(2, $dept['Sales']['days_worked']);
        $this->assertSame(0.0, (float) $dept['Support']['attendance_rate']);

        $this->getJson('/api/v1/reports/attendance/detail?month=5&year=2026&department_id=' . $ann->department_id)
            ->assertOk()
            ->assertJsonCount(1, 'data.employees');

        foreach (['employees', 'departments', 'late', 'overtime', 'grid'] as $view) {
            $this->get("/api/v1/reports/attendance/detail?month=5&year=2026&view={$view}&format=csv")
                ->assertOk();
        }

        $this->getJson('/api/v1/reports/attendance/detail?month=13&year=2026')->assertStatus(422);
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
        $company = \App\Models\Company::create(['name' => 'Dashboard Co']);
        $user = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $company->id]);
        $department = Department::create(['name' => 'Operations']);
        $employee = Employee::create([
            'company_id' => $company->id,
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


