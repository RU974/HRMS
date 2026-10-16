<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Shift;
use App\Models\User;
use App\Services\AttendanceStatusRecalculator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceLateStatusCorrectionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $employeeUser;
    private Employee $employee;
    private Shift $shift;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Grace Co']);
        AttendancePolicy::create(['name' => 'Default', 'late_after_time' => '09:00:00', 'allow_manual_status_override' => true]);
        $department = Department::create(['name' => 'Sales']);
        $this->shift = Shift::create([
            'company_id' => $this->company->id, 'name' => 'Night', 'start_time' => '20:00:00', 'end_time' => '05:00:00',
            'continues_after_midnight' => true, 'grace_minutes' => 0, 'working_days' => [1, 2, 3, 4, 5], 'is_active' => true,
        ]);
        $this->employeeUser = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->employee = Employee::create([
            'company_id' => $this->company->id, 'user_id' => $this->employeeUser->id, 'name' => 'Mishal',
            'email' => 'mishal@example.com', 'department_id' => $department->id, 'designation' => 'Agent',
            'salary' => 1000, 'status' => 'active', 'shift_id' => $this->shift->id,
        ]);
    }

    private function lateRecord(): Attendance
    {
        return Attendance::create([
            'employee_id' => $this->employee->id, 'date' => '2026-10-14', 'status' => 'late',
            'check_in' => '2026-10-14 20:09:00', 'check_out' => '2026-10-15 05:41:00',
        ]);
    }

    private function review(Attendance $attendance, array $correction = []): void
    {
        Sanctum::actingAs($this->employeeUser);
        $this->postJson("/api/v1/attendance/{$attendance->id}/request-correction", ['correction_request_notes' => 'Within grace'] + $correction)->assertOk();

        $manager = $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $this->company->id]);
        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/attendance/{$attendance->id}/review-correction", ['correction_status' => 'approved'])->assertOk();
    }

    public function test_approved_correction_without_times_clears_late(): void
    {
        $attendance = $this->lateRecord();
        $this->review($attendance);

        $this->assertSame('present', $attendance->fresh()->status);
    }

    public function test_approved_correction_with_time_inside_grace_clears_late_even_with_manual_override_policy(): void
    {
        $this->shift->update(['grace_minutes' => 15]);
        $attendance = $this->lateRecord();
        $this->review($attendance, ['proposed_check_in' => '20:10']);

        $this->assertSame('present', $attendance->fresh()->status);
    }

    public function test_approved_correction_with_time_after_grace_stays_late(): void
    {
        $attendance = $this->lateRecord();
        $attendance->update(['status' => 'present']);
        $this->review($attendance, ['proposed_check_in' => '20:30']);

        $this->assertSame('late', $attendance->fresh()->status);
    }

    public function test_editing_a_record_recomputes_status_from_new_check_in(): void
    {
        $this->shift->update(['grace_minutes' => 15]);
        $attendance = $this->lateRecord();
        $manager = $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $this->company->id]);
        Sanctum::actingAs($manager);

        $this->putJson("/api/v1/attendance/{$attendance->id}", ['check_in' => '20:10', 'status' => 'late'])->assertOk();

        $this->assertSame('present', $attendance->fresh()->status);
    }

    public function test_changing_shift_grace_refreshes_existing_late_records_when_asked_to_resnapshot(): void
    {
        $attendance = $this->lateRecord();
        $this->shift->departmentGraces()->create(['department_id' => $this->employee->department_id, 'grace_minutes' => 30]);

        $changed = app(AttendanceStatusRecalculator::class)->recalculate(Carbon::parse('2026-10-01'), null, null, true, null, null, true);

        $this->assertSame(1, $changed);
        $this->assertSame('present', $attendance->fresh()->status);
    }

    public function test_a_grace_change_does_not_re_judge_a_past_day_on_its_own(): void
    {
        $attendance = $this->lateRecord();
        $this->shift->departmentGraces()->create(['department_id' => $this->employee->department_id, 'grace_minutes' => 30]);

        $changed = app(AttendanceStatusRecalculator::class)->recalculate(Carbon::parse('2026-10-01'));

        $this->assertSame(0, $changed);
        $this->assertSame('late', $attendance->fresh()->status);
    }
}
