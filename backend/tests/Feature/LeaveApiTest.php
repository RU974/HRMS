<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_can_create_own_leave_and_manager_can_approve(): void
    {
        $manager = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Engineering']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'name' => 'John Worker',
            'email' => 'john.worker@example.com',
            'department_id' => $department->id,
            'designation' => 'Developer',
            'salary' => 1000,
            'status' => 'active',
        ]);

        Sanctum::actingAs($employeeUser);
        $createResponse = $this->postJson('/api/v1/leaves', [
            'employee_id' => $employee->id,
            'type' => 'annual',
            'from_date' => '2026-05-20',
            'to_date' => '2026-05-22',
        ]);

        $createResponse->assertCreated()->assertJsonPath('data.status', 'pending');
        $leaveId = $createResponse->json('data.id');

        Sanctum::actingAs($manager);
        $this->putJson('/api/v1/leaves/' . $leaveId, ['status' => 'approved'])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');
    }

    public function test_employee_cannot_create_leave_for_other_employee(): void
    {
        $employeeUserA = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $employeeUserB = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Operations']);

        Employee::create([
            'user_id' => $employeeUserA->id,
            'name' => 'Emp A',
            'email' => 'emp.a@example.com',
            'department_id' => $department->id,
            'designation' => 'Ops',
            'salary' => 1000,
            'status' => 'active',
        ]);

        $employeeB = Employee::create([
            'user_id' => $employeeUserB->id,
            'name' => 'Emp B',
            'email' => 'emp.b@example.com',
            'department_id' => $department->id,
            'designation' => 'Ops',
            'salary' => 1000,
            'status' => 'active',
        ]);

        Sanctum::actingAs($employeeUserA);
        $this->postJson('/api/v1/leaves', [
            'employee_id' => $employeeB->id,
            'type' => 'sick',
            'from_date' => '2026-05-20',
            'to_date' => '2026-05-20',
        ])->assertForbidden();
    }

    public function test_leave_creation_enforces_policy_balance_and_multi_level_approval(): void
    {
        $manager = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        $employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $department = Department::create(['name' => 'Engineering']);
        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'name' => 'John Worker',
            'email' => 'john.worker@example.com',
            'department_id' => $department->id,
            'designation' => 'Developer',
            'salary' => 1000,
            'status' => 'active',
        ]);

        LeaveType::create([
            'name' => 'annual',
            'default_days' => 3,
            'accrual_frequency' => 'yearly',
            'required_approval_levels' => 2,
            'is_paid' => true,
            'is_active' => true,
        ]);

        Sanctum::actingAs($employeeUser);

        Sanctum::actingAs($employeeUser);

        $this->postJson('/api/v1/leaves', [
            'employee_id' => $employee->id,
            'type' => 'annual',
            'from_date' => '2026-05-20',
            'to_date' => '2026-05-22',
        ])->assertCreated()->assertJsonPath('data.status', 'pending');

        $this->postJson('/api/v1/leaves', [
            'employee_id' => $employee->id,
            'type' => 'annual',
            'from_date' => '2026-05-20',
            'to_date' => '2026-05-24',
        ])->assertStatus(422);

        Sanctum::actingAs($manager);
        $leaveResponse = $this->postJson('/api/v1/leaves', [
            'employee_id' => $employee->id,
            'type' => 'annual',
            'from_date' => '2026-05-20',
            'to_date' => '2026-05-22',
            'status' => 'approved',
        ]);
        $leaveResponse->assertCreated();
        $leaveId = $leaveResponse->json('data.id');

        $firstApproval = $this->putJson('/api/v1/leaves/' . $leaveId, ['status' => 'approved']);
        $firstApproval->assertOk()->assertJsonPath('data.status', 'pending');

        $secondApproval = $this->putJson('/api/v1/leaves/' . $leaveId, ['status' => 'approved']);
        $secondApproval->assertOk()->assertJsonPath('data.status', 'approved');
    }
}


