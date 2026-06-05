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
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/v1/employees')->assertForbidden();
    }

    public function test_employee_cannot_search_employees()
    {
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/v1/employees/search?q=John')->assertForbidden();
    }

    public function test_employee_cannot_get_employees_by_department()
    {
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Operations']);
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/v1/employees/department/' . $department->id)->assertForbidden();
    }

    public function test_employee_cannot_export_employees()
    {
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        Sanctum::actingAs($employeeUser);

        $this->get('/api/v1/employees/export/csv')->assertForbidden();
    }

    public function test_employee_cannot_check_in_for_another_employee()
    {
        $selfUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $otherUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
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

        $this->postJson('/api/v1/attendance/check-in', ['employee_id' => $otherEmployee->id])
            ->assertForbidden();
    }

    public function test_employee_cannot_check_out_for_another_employee()
    {
        $selfUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $otherUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
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

        $this->postJson('/api/v1/attendance/check-out', ['employee_id' => $otherEmployee->id])
            ->assertForbidden();
    }

    public function test_employee_cannot_view_other_employee_attendance_list()
    {
        $selfUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $otherUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
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

        $this->getJson('/api/v1/attendance?employee_id=' . $otherEmployee->id)
            ->assertForbidden();
    }

    public function test_employee_cannot_view_other_employee_attendance_record()
    {
        $selfUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $otherUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
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

        $this->getJson('/api/v1/attendance/' . $attendance->id)
            ->assertForbidden();
    }

    public function test_check_in_does_not_create_duplicate_attendance_for_same_day()
    {
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'name' => 'Test Employee',
            'email' => 'test@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        Attendance::create([
            'employee_id' => $employee->id,
            'date' => now()->toDateString(),
            'check_in' => now()->subHour()->toDateTimeString(),
            'status' => 'present',
        ]);

        Sanctum::actingAs($employeeUser);

        $this->postJson('/api/v1/attendance/check-in', ['employee_id' => $employee->id])
            ->assertOk()
            ->assertJson(['message' => 'Already checked in for today']);
    }

    public function test_employee_can_request_attendance_correction()
    {
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'name' => 'Test Employee',
            'email' => 'test@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $attendance = Attendance::create([
            'employee_id' => $employee->id,
            'date' => now()->toDateString(),
            'check_in' => now()->subHour()->toDateTimeString(),
            'status' => 'present',
        ]);

        Sanctum::actingAs($employeeUser);

        $this->postJson('/api/v1/attendance/' . $attendance->id . '/request-correction', [
            'correction_request_notes' => 'Please adjust my check-in time.',
        ])
            ->assertOk()
            ->assertJson(['message' => 'Correction request submitted successfully']);

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'correction_status' => 'pending',
        ]);
    }

    public function test_attendance_manager_can_review_correction_request()
    {
        $managerUser = $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE)->id,
            'name' => 'Test Employee',
            'email' => 'test2@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $attendance = Attendance::create([
            'employee_id' => $employee->id,
            'date' => now()->toDateString(),
            'check_in' => now()->subHour()->toDateTimeString(),
            'status' => 'present',
            'correction_status' => 'pending',
            'correction_request_notes' => 'Need adjustment',
        ]);

        Sanctum::actingAs($managerUser);

        $this->postJson('/api/v1/attendance/' . $attendance->id . '/review-correction', [
            'correction_status' => 'approved',
            'correction_response_notes' => 'Approved by manager.',
        ])
            ->assertOk()
            ->assertJson(['message' => 'Correction request reviewed successfully']);

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'correction_status' => 'approved',
        ]);
    }

    public function test_attendance_manager_can_list_correction_requests()
    {
        $managerUser = $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE)->id,
            'name' => 'Correction Employee',
            'email' => 'correction@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        Attendance::create([
            'employee_id' => $employee->id,
            'date' => now()->toDateString(),
            'check_in' => now()->subHour()->toDateTimeString(),
            'status' => 'present',
            'correction_status' => 'pending',
            'correction_request_notes' => 'Correction requested',
        ]);

        Sanctum::actingAs($managerUser);

        $this->getJson('/api/v1/attendance/corrections')
            ->assertOk()
            ->assertJsonFragment(['correction_status' => 'pending']);
    }

    public function test_attendance_update_rejects_checkout_before_checkin()
    {
        $managerUser = $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER);
        $department = Department::create(['name' => 'Finance']);
        $employee = Employee::create([
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE)->id,
            'name' => 'Time Validation Employee',
            'email' => 'timevalidation@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $attendance = Attendance::create([
            'employee_id' => $employee->id,
            'date' => now()->toDateString(),
            'check_in' => now()->subHours(4)->toDateTimeString(),
            'status' => 'present',
        ]);

        Sanctum::actingAs($managerUser);

        $this->putJson('/api/v1/attendance/' . $attendance->id, [
            'check_in' => '09:00',
            'check_out' => '08:00',
        ])
            ->assertStatus(422)
            ->assertJson(['message' => 'Check-out cannot be earlier than check-in.']);
    }
}


