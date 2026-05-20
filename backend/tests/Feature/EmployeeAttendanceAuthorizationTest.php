<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeAttendanceAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_cannot_list_employees()
    {
        $employeeUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/employees')->assertForbidden();
    }

    public function test_employee_cannot_search_employees()
    {
        $employeeUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/employees/search?q=John')->assertForbidden();
    }

    public function test_employee_cannot_get_employees_by_department()
    {
        $employeeUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $department = Department::create(['name' => 'Operations']);
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/employees/department/' . $department->id)->assertForbidden();
    }

    public function test_employee_cannot_export_employees()
    {
        $employeeUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        Sanctum::actingAs($employeeUser);

        $this->get('/api/employees/export/csv')->assertForbidden();
    }

    public function test_employee_cannot_check_in_for_another_employee()
    {
        $selfUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $otherUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $department = Department::create(['name' => 'Finance']);

        $selfEmployee = Employee::create([
            'user_id' => $selfUser->id,
            'name' => 'Self Employee',
            'email' => 'self@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $otherEmployee = Employee::create([
            'user_id' => $otherUser->id,
            'name' => 'Other Employee',
            'email' => 'other@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1300,
            'status' => 'active',
        ]);

        Sanctum::actingAs($selfUser);

        $this->postJson('/api/attendance/check-in', ['employee_id' => $otherEmployee->id])
            ->assertForbidden();
    }

    public function test_employee_cannot_check_out_for_another_employee()
    {
        $selfUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $otherUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $department = Department::create(['name' => 'Finance']);

        $selfEmployee = Employee::create([
            'user_id' => $selfUser->id,
            'name' => 'Self Employee',
            'email' => 'self@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $otherEmployee = Employee::create([
            'user_id' => $otherUser->id,
            'name' => 'Other Employee',
            'email' => 'other@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1300,
            'status' => 'active',
        ]);

        Attendance::create([
            'employee_id' => $otherEmployee->id,
            'date' => now()->toDateString(),
            'check_in' => now()->toDateTimeString(),
            'status' => 'present',
        ]);

        Sanctum::actingAs($selfUser);

        $this->postJson('/api/attendance/check-out', ['employee_id' => $otherEmployee->id])
            ->assertForbidden();
    }

    public function test_employee_cannot_view_other_employee_attendance_list()
    {
        $selfUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $otherUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $department = Department::create(['name' => 'Finance']);

        $selfEmployee = Employee::create([
            'user_id' => $selfUser->id,
            'name' => 'Self Employee',
            'email' => 'self@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $otherEmployee = Employee::create([
            'user_id' => $otherUser->id,
            'name' => 'Other Employee',
            'email' => 'other@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1300,
            'status' => 'active',
        ]);

        Sanctum::actingAs($selfUser);

        $this->getJson('/api/attendance?employee_id=' . $otherEmployee->id)
            ->assertForbidden();
    }

    public function test_employee_cannot_view_other_employee_attendance_record()
    {
        $selfUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $otherUser = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        $department = Department::create(['name' => 'Finance']);

        $selfEmployee = Employee::create([
            'user_id' => $selfUser->id,
            'name' => 'Self Employee',
            'email' => 'self@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $otherEmployee = Employee::create([
            'user_id' => $otherUser->id,
            'name' => 'Other Employee',
            'email' => 'other@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1300,
            'status' => 'active',
        ]);

        $attendance = Attendance::create([
            'employee_id' => $otherEmployee->id,
            'date' => now()->toDateString(),
            'check_in' => now()->toDateTimeString(),
            'status' => 'present',
        ]);

        Sanctum::actingAs($selfUser);

        $this->getJson('/api/attendance/' . $attendance->id)
            ->assertForbidden();
    }
}
