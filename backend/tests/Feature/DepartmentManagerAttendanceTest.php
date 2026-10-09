<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepartmentManagerAttendanceTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company);
    }

    private function userWithRole(string $role): User
    {
        return $this->createUserWithRole($role, ['company_id' => $this->company->id]);
    }

    private function makeEmployee(User $user, string $name, ?int $departmentId): Employee
    {
        return Employee::create([
            'user_id' => $user->id,
            'company_id' => $this->company->id,
            'name' => $name,
            'email' => strtolower(str_replace(' ', '.', $name)) . '@example.com',
            'department_id' => $departmentId,
            'designation' => 'Staff',
            'salary' => 1000,
            'status' => 'active',
        ]);
    }

    private function record(Employee $employee): Attendance
    {
        return Attendance::create([
            'employee_id' => $employee->id,
            'date' => now()->toDateString(),
            'status' => 'present',
        ]);
    }

    public function test_department_manager_sees_only_own_department_attendance()
    {
        $dept = Department::create(['name' => 'Sales']);
        $otherDept = Department::create(['name' => 'Ops']);

        $managerUser = $this->userWithRole(User::ROLE_DEPARTMENT_MANAGER);
        $manager = $this->makeEmployee($managerUser, 'Mia Manager', $dept->id);
        $teammate = $this->makeEmployee($this->userWithRole(User::ROLE_EMPLOYEE), 'Tom Teammate', $dept->id);
        $outsider = $this->makeEmployee($this->userWithRole(User::ROLE_EMPLOYEE), 'Olga Outsider', $otherDept->id);

        $this->record($manager);
        $this->record($teammate);
        $this->record($outsider);

        Sanctum::actingAs($managerUser);

        $r = $this->getJson('/api/v1/attendance'); $ids = collect($r->assertOk()->json('data.data'))
            ->pluck('employee_id')->all();
        $this->assertEqualsCanonicalizing([$manager->id, $teammate->id], $ids);

        $this->getJson('/api/v1/attendance/employee/' . $teammate->id)->assertOk();
        $this->getJson('/api/v1/attendance/employee/' . $outsider->id)->assertForbidden();
        $this->getJson('/api/v1/attendance?employee_id=' . $outsider->id)->assertForbidden();

        $names = collect($this->getJson('/api/v1/attendance/team-daily?date=' . now()->toDateString())
            ->assertOk()->json('data'))->pluck('name')->all();
        $this->assertEqualsCanonicalizing(['Mia Manager', 'Tom Teammate'], $names);
    }

    public function test_department_manager_cannot_modify_attendance()
    {
        $dept = Department::create(['name' => 'Sales']);
        $managerUser = $this->userWithRole(User::ROLE_DEPARTMENT_MANAGER);
        $this->makeEmployee($managerUser, 'Mia Manager', $dept->id);
        $teammate = $this->makeEmployee($this->userWithRole(User::ROLE_EMPLOYEE), 'Tom Teammate', $dept->id);
        $record = $this->record($teammate);

        Sanctum::actingAs($managerUser);

        $this->putJson('/api/v1/attendance/' . $record->id, ['status' => 'absent'])->assertForbidden();
        $this->deleteJson('/api/v1/attendance/' . $record->id)->assertForbidden();
    }

    public function test_manager_sees_direct_reports_from_other_departments()
    {
        $dept = Department::create(['name' => 'Sales']);
        $otherDept = Department::create(['name' => 'Ops']);
        $managerUser = $this->userWithRole(User::ROLE_DEPARTMENT_MANAGER);
        $manager = $this->makeEmployee($managerUser, 'Mia Manager', $dept->id);
        $report = $this->makeEmployee($this->userWithRole(User::ROLE_EMPLOYEE), 'Rae Report', $otherDept->id);
        $report->update(['manager_id' => $manager->id]);
        $stranger = $this->makeEmployee($this->userWithRole(User::ROLE_EMPLOYEE), 'Sam Stranger', $otherDept->id);

        Sanctum::actingAs($managerUser);

        $this->getJson('/api/v1/attendance/employee/' . $report->id)->assertOk();
        $this->getJson('/api/v1/attendance/employee/' . $stranger->id)->assertForbidden();
    }
}
