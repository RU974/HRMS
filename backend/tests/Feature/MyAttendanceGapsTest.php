<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MyAttendanceGapsTest extends TestCase
{
    use RefreshDatabase;

    private ?Company $company = null;

    private function userWithRole(string $role): User
    {
        $this->company ??= Company::create(['name' => 'Gap Co']);

        return $this->createUserWithRole($role, ['company_id' => $this->company->id]);
    }

    private function makeEmployee(User $user, string $email): Employee
    {
        return Employee::create([
            'company_id' => $user->company_id,
            'user_id' => $user->id,
            'name' => 'Emp ' . $email,
            'email' => $email,
            'department_id' => Department::create(['name' => 'Dept ' . $email])->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);
    }

    public function test_own_list_is_newest_first(): void
    {
        $user = $this->userWithRole(User::ROLE_EMPLOYEE);
        $employee = $this->makeEmployee($user, 'order@example.com');
        foreach (['2026-09-01', '2026-09-03', '2026-09-02'] as $d) {
            Attendance::create(['employee_id' => $employee->id, 'date' => $d, 'status' => 'present']);
        }
        Sanctum::actingAs($user);

        $dates = collect($this->getJson('/api/v1/attendance')->assertOk()->json('data.data'))
            ->pluck('date')->map(fn ($d) => substr($d, 0, 10))->all();

        $this->assertSame(['2026-09-03', '2026-09-02', '2026-09-01'], $dates);
    }

    public function test_monthly_stats_include_hours_and_wfh(): void
    {
        $user = $this->userWithRole(User::ROLE_EMPLOYEE);
        $employee = $this->makeEmployee($user, 'stats@example.com');
        Attendance::create([
            'employee_id' => $employee->id, 'date' => '2026-09-02', 'status' => 'present',
            'check_in' => '2026-09-02 09:00:00', 'check_out' => '2026-09-02 17:00:00', 'work_from_home' => true,
        ]);
        Sanctum::actingAs($user);

        $res = $this->getJson("/api/v1/attendance/monthly-stats/{$employee->id}/9/2026")->assertOk();
        $res->assertJsonPath('data.wfh_days', 1);
        $this->assertEquals(8.0, $res->json('data.total_hours'));
    }

    public function test_employee_can_export_only_their_own_records(): void
    {
        $user = $this->userWithRole(User::ROLE_EMPLOYEE);
        $other = $this->userWithRole(User::ROLE_EMPLOYEE);
        $mine = $this->makeEmployee($user, 'mine@example.com');
        $theirs = $this->makeEmployee($other, 'theirs@example.com');
        Attendance::create(['employee_id' => $mine->id, 'date' => '2026-09-02', 'status' => 'present']);
        Attendance::create(['employee_id' => $theirs->id, 'date' => '2026-09-02', 'status' => 'late']);
        Sanctum::actingAs($user);

        $csv = $this->get('/api/v1/attendance/export')->assertOk()->streamedContent();

        $this->assertStringContainsString('Emp mine@example.com', $csv);
        $this->assertStringNotContainsString('Emp theirs@example.com', $csv);
    }

    public function test_approved_correction_applies_proposed_times_and_notifies_employee(): void
    {
        $managerUser = $this->userWithRole(User::ROLE_ATTENDANCE_MANAGER);
        $user = $this->userWithRole(User::ROLE_EMPLOYEE);
        $employee = $this->makeEmployee($user, 'fix@example.com');
        $attendance = Attendance::create([
            'employee_id' => $employee->id, 'date' => '2026-09-02', 'status' => 'late',
            'check_in' => '2026-09-02 11:00:00', 'check_out' => '2026-09-02 17:00:00',
        ]);

        Sanctum::actingAs($user);
        $this->postJson("/api/v1/attendance/{$attendance->id}/request-correction", [
            'correction_request_notes' => 'Forgot to punch in on time',
            'proposed_check_in' => '09:00',
            'proposed_check_out' => '18:00',
        ])->assertOk();

        Sanctum::actingAs($managerUser);
        $this->postJson("/api/v1/attendance/{$attendance->id}/review-correction", [
            'correction_status' => 'approved',
        ])->assertOk();

        $attendance->refresh();
        $this->assertSame('2026-09-02 09:00:00', $attendance->check_in->toDateTimeString());
        $this->assertSame('2026-09-02 18:00:00', $attendance->check_out->toDateTimeString());
        $this->assertSame('approved', $attendance->correction_status);
        $this->assertTrue(NotificationItem::where('user_id', $user->id)->where('type', 'attendance_correction_approved')->exists());
    }

    public function test_a_reviewed_correction_cannot_be_reviewed_again(): void
    {
        $managerUser = $this->userWithRole(User::ROLE_ATTENDANCE_MANAGER);
        $employee = $this->makeEmployee($this->userWithRole(User::ROLE_EMPLOYEE), 'done@example.com');
        $attendance = Attendance::create([
            'employee_id' => $employee->id, 'date' => '2026-09-02', 'status' => 'present',
            'correction_status' => 'approved', 'correction_request_notes' => 'x',
        ]);
        Sanctum::actingAs($managerUser);

        $this->postJson("/api/v1/attendance/{$attendance->id}/review-correction", ['correction_status' => 'rejected'])
            ->assertStatus(422);
    }

    public function test_reviewer_cannot_approve_their_own_correction(): void
    {
        $managerUser = $this->userWithRole(User::ROLE_ATTENDANCE_MANAGER);
        $employee = $this->makeEmployee($managerUser, 'self@example.com');
        $attendance = Attendance::create([
            'employee_id' => $employee->id, 'date' => '2026-09-02', 'status' => 'present',
            'correction_status' => 'pending', 'correction_request_notes' => 'x',
        ]);
        Sanctum::actingAs($managerUser);

        $this->postJson("/api/v1/attendance/{$attendance->id}/review-correction", ['correction_status' => 'approved'])
            ->assertForbidden();
    }
}
