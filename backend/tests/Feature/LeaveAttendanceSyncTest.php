<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\LeaveBalance;
use App\Models\LeaveType;
use App\Models\Shift;
use App\Models\User;
use App\Services\AttendanceCalculator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveAttendanceSyncTest extends TestCase
{
    use RefreshDatabase;

    private Employee $employee;
    private User $hr;

    protected function setUp(): void
    {
        parent::setUp();
        $company = Company::create(['name' => 'Acme HR']);
        $this->hr = $this->createUserWithRole(User::ROLE_HR_MANAGER);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $this->employee = Employee::create([
            'user_id' => $user->id,
            'company_id' => $this->hr->company_id ?? $company->id,
            'name' => 'Ali Worker',
            'email' => 'ali.worker@example.com',
            'department_id' => Department::create(['name' => 'Ops'])->id,
            'designation' => 'Staff',
            'salary' => 1000,
            'status' => 'active',
        ]);
        Sanctum::actingAs($this->hr);
    }

    private function request(array $over = []): int
    {
        return $this->postJson('/api/v1/leaves', array_merge([
            'employee_id' => $this->employee->id,
            'type' => 'annual',
            'from_date' => '2026-09-14', // Mon
            'to_date' => '2026-09-16',   // Wed
        ], $over))->assertCreated()->json('data.id');
    }

    private function rows(?int $leaveId = null)
    {
        return Attendance::where('employee_id', $this->employee->id)
            ->when($leaveId, fn ($q) => $q->where('leave_id', $leaveId))
            ->orderBy('date')->get();
    }

    private function dates($rows): array
    {
        return $rows->map(fn ($r) => $r->date->toDateString())->all();
    }

    public function test_approving_leave_creates_leave_rows_for_working_days_only(): void
    {
        // Fri 11th .. Tue 15th: Sat/Sun are off days.
        $id = $this->request(['from_date' => '2026-09-11', 'to_date' => '2026-09-15']);
        $this->assertCount(0, $this->rows());

        $this->putJson("/api/v1/leaves/$id", ['status' => 'approved'])->assertOk();

        $rows = $this->rows($id);
        $this->assertSame(['2026-09-11', '2026-09-14', '2026-09-15'], $this->dates($rows));
        $this->assertTrue($rows->every(fn ($r) => $r->status === 'leave'));
    }

    public function test_leave_created_already_approved_by_an_approver_is_reflected(): void
    {
        $id = $this->request(['status' => 'approved']);
        $this->assertCount(3, $this->rows($id));
    }

    public function test_mandatory_holiday_is_not_marked_as_leave(): void
    {
        Holiday::withoutGlobalScopes()->create([
            'name' => 'Day off', 'holiday_date' => '2026-09-15', 'is_optional' => false,
            'company_id' => $this->employee->company_id,
        ]);
        $id = $this->request();
        $this->putJson("/api/v1/leaves/$id", ['status' => 'approved'])->assertOk();

        $this->assertSame(['2026-09-14', '2026-09-16'], $this->dates($this->rows($id)));
    }

    public function test_half_day_leave_creates_a_single_half_day_row(): void
    {
        $id = $this->request(['half_day' => true]);
        $this->putJson("/api/v1/leaves/$id", ['status' => 'approved'])->assertOk();

        $rows = $this->rows($id);
        $this->assertCount(1, $rows);
        $this->assertSame('half_day', $rows[0]->status);
        $this->assertSame('2026-09-14', $rows[0]->date->toDateString());
        $this->assertSame('2026-09-14', substr((string) Leave::find($id)->getRawOriginal('to_date'), 0, 10));
    }

    public function test_half_day_leave_deducts_half_a_day_from_the_balance(): void
    {
        LeaveType::create(['name' => 'annual', 'default_days' => 10, 'accrual_amount' => 10, 'allow_half_day' => true, 'is_active' => true, 'company_id' => $this->employee->company_id]);
        $id = $this->request(['half_day' => true]);
        $this->putJson("/api/v1/leaves/$id", ['status' => 'approved'])->assertOk();

        $balance = LeaveBalance::where('employee_id', $this->employee->id)->first();
        $this->assertEqualsWithDelta(0.5, (float) $balance->used_days, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $balance->pending_days, 0.001);
    }

    public function test_cancelling_removes_the_rows_again(): void
    {
        $id = $this->request(['status' => 'approved']);
        $this->assertCount(3, $this->rows($id));

        $this->putJson("/api/v1/leaves/$id", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(0, Attendance::where('employee_id', $this->employee->id)->where('status', 'leave')->count());
    }

    public function test_deleting_an_approved_leave_removes_its_rows(): void
    {
        $id = $this->request(['status' => 'approved']);
        $this->deleteJson("/api/v1/leaves/$id")->assertOk();

        $this->assertSame(0, Attendance::where('employee_id', $this->employee->id)->count());
    }

    public function test_changing_dates_of_an_approved_leave_moves_the_rows(): void
    {
        $id = $this->request(['status' => 'approved']);
        $this->putJson("/api/v1/leaves/$id", ['from_date' => '2026-09-15', 'to_date' => '2026-09-17'])->assertOk();

        $this->assertSame(['2026-09-15', '2026-09-16', '2026-09-17'], $this->dates($this->rows($id)));
    }

    public function test_auto_marked_absence_is_converted_and_real_punches_are_kept(): void
    {
        Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-09-14', 'status' => 'absent', 'notes' => 'Auto-marked absent: no check-in/check-out and no approved leave.']);
        Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-09-15', 'status' => 'present', 'check_in' => '2026-09-15 09:00:00', 'check_out' => '2026-09-15 17:00:00']);

        $id = $this->request(['status' => 'approved']);

        $byDate = $this->rows()->keyBy(fn ($r) => $r->date->toDateString());
        $this->assertSame('leave', $byDate['2026-09-14']->status);
        $this->assertSame($id, (int) $byDate['2026-09-14']->leave_id);
        $this->assertSame('present', $byDate['2026-09-15']->status); // worked: left alone
        $this->assertNull($byDate['2026-09-15']->leave_id);
        $this->assertSame('leave', $byDate['2026-09-16']->status);
    }

    public function test_cancelling_a_past_leave_hands_the_days_back_to_the_absence_sweep(): void
    {
        $this->travelTo(Carbon::parse('2026-09-30 10:00'));
        $id = $this->request(['status' => 'approved']);
        $this->putJson("/api/v1/leaves/$id", ['status' => 'cancelled'])->assertOk();

        $this->assertSame(3, Attendance::where('employee_id', $this->employee->id)->where('status', 'absent')->count());
    }

    public function test_half_day_row_keeps_its_status_when_the_employee_punches_in(): void
    {
        $id = $this->request(['half_day' => true, 'status' => 'approved']);
        $row = $this->rows($id)->first();
        $row->check_in = '2026-09-14 13:00:00';
        $row->check_out = '2026-09-14 18:00:00';

        $this->assertSame('half_day', (new AttendanceCalculator())->recomputeStatus($row, null, null));
    }

    public function test_backfill_command_covers_leaves_approved_before_the_link_existed(): void
    {
        $leave = Leave::create([
            'employee_id' => $this->employee->id, 'type' => 'annual',
            'from_date' => '2026-09-14', 'to_date' => '2026-09-16', 'status' => 'approved', 'approval_step' => 1,
        ]);
        $this->assertCount(0, $this->rows());

        $this->artisan('attendance:sync-leaves')->assertSuccessful();
        $this->assertCount(0, $this->rows()); // dry run

        $this->artisan('attendance:sync-leaves --apply')->assertSuccessful();
        $this->assertCount(3, $this->rows($leave->id));
    }

    public function test_multi_level_leave_reaches_attendance_only_after_the_last_approval(): void
    {
        LeaveType::create(['name' => 'annual', 'default_days' => 10, 'accrual_amount' => 10, 'required_approval_levels' => 2, 'is_active' => true, 'company_id' => $this->employee->company_id]);
        $id = $this->request();

        $this->putJson("/api/v1/leaves/$id", ['status' => 'approved'])->assertOk()->assertJsonPath('data.status', 'pending');
        $this->assertCount(0, $this->rows());

        $this->putJson("/api/v1/leaves/$id", ['status' => 'approved'])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertCount(3, $this->rows($id));
    }

    private function annualType(array $over = []): LeaveType
    {
        return LeaveType::create(array_merge(['name' => 'annual', 'default_days' => 10, 'accrual_amount' => 10, 'allow_half_day' => true, 'is_active' => true, 'company_id' => $this->employee->company_id], $over));
    }

    private function used(): float
    {
        return (float) (LeaveBalance::where('employee_id', $this->employee->id)->first()?->used_days ?? 0);
    }

    public function test_balance_follows_the_employees_shift_working_days(): void
    {
        $this->annualType();
        $shift = Shift::create(['company_id' => $this->employee->company_id, 'name' => 'Six day', 'start_time' => '09:00', 'end_time' => '17:00', 'working_days' => [1, 2, 3, 4, 5, 6]]);
        $this->employee->update(['shift_id' => $shift->id]);

        // Fri 11th .. Sat 12th: both are working days on a Mon-Sat shift.
        $id = $this->request(['from_date' => '2026-09-11', 'to_date' => '2026-09-12', 'status' => 'approved']);

        $this->assertSame(['2026-09-11', '2026-09-12'], $this->dates($this->rows($id)));
        $this->assertEqualsWithDelta(2.0, $this->used(), 0.001);
    }

    public function test_editing_an_approved_leave_adjusts_the_balance(): void
    {
        $this->annualType();
        $id = $this->request(['status' => 'approved']); // 3 days
        $this->assertEqualsWithDelta(3.0, $this->used(), 0.001);

        $this->putJson("/api/v1/leaves/$id", ['to_date' => '2026-09-15'])->assertOk(); // 2 days
        $this->assertEqualsWithDelta(2.0, $this->used(), 0.001);

        $this->putJson("/api/v1/leaves/$id", ['status' => 'cancelled'])->assertOk();
        $this->assertEqualsWithDelta(0.0, $this->used(), 0.001);
    }

    public function test_editing_an_approved_leave_beyond_the_balance_is_refused_and_changes_nothing(): void
    {
        $this->annualType(['default_days' => 3, 'accrual_amount' => 3]);
        $id = $this->request(['status' => 'approved']); // 3 of 3

        $this->putJson("/api/v1/leaves/$id", ['to_date' => '2026-09-18'])->assertStatus(422); // would need 5
        $this->assertEqualsWithDelta(3.0, $this->used(), 0.001);
        $this->assertCount(3, $this->rows($id));
    }

    public function test_reopening_a_cancelled_leave_takes_the_balance_again(): void
    {
        $this->annualType();
        $id = $this->request(['status' => 'approved']);
        $this->putJson("/api/v1/leaves/$id", ['status' => 'cancelled'])->assertOk();
        $this->assertEqualsWithDelta(0.0, $this->used(), 0.001);

        $this->putJson("/api/v1/leaves/$id", ['status' => 'approved'])->assertOk();
        $this->assertEqualsWithDelta(3.0, $this->used(), 0.001);
        $this->assertCount(3, $this->rows($id));
    }

    public function test_a_holiday_added_or_removed_after_approval_updates_the_rows(): void
    {
        $id = $this->request(['status' => 'approved']);
        $this->assertCount(3, $this->rows($id));

        $holiday = Holiday::withoutGlobalScopes()->create(['name' => 'Late holiday', 'holiday_date' => '2026-09-15', 'is_optional' => false, 'company_id' => $this->employee->company_id]);
        $this->assertSame(['2026-09-14', '2026-09-16'], $this->dates($this->rows($id)));

        $holiday->delete();
        $this->assertSame(['2026-09-14', '2026-09-15', '2026-09-16'], $this->dates($this->rows($id)));
    }

    public function test_changing_the_shift_working_days_or_the_employees_shift_updates_the_rows(): void
    {
        $shift = Shift::create(['company_id' => $this->employee->company_id, 'name' => 'Six day', 'start_time' => '09:00', 'end_time' => '17:00', 'working_days' => [1, 2, 3, 4, 5]]);
        $this->employee->update(['shift_id' => $shift->id]);
        $id = $this->request(['from_date' => '2026-09-11', 'to_date' => '2026-09-12', 'status' => 'approved']);
        $this->assertSame(['2026-09-11'], $this->dates($this->rows($id)));

        $shift->update(['working_days' => [1, 2, 3, 4, 5, 6]]);
        $this->assertSame(['2026-09-11', '2026-09-12'], $this->dates($this->rows($id)));

        $this->employee->update(['shift_id' => null]); // back to Mon-Fri
        $this->assertSame(['2026-09-11'], $this->dates($this->rows($id)));
    }

    public function test_a_leave_row_cannot_be_deleted_by_hand_and_a_resync_is_idempotent(): void
    {
        $id = $this->request(['status' => 'approved']);
        $row = $this->rows($id)->first();

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_COMPANY_ADMIN));
        $this->deleteJson("/api/v1/attendance/{$row->id}")->assertStatus(422);
        $this->assertCount(3, $this->rows($id));

        $this->artisan('attendance:sync-leaves --apply')->assertSuccessful();
        $this->artisan('attendance:sync-leaves --apply --days=35')->assertSuccessful();
        $this->assertCount(3, $this->rows($id));
    }

    public function test_a_deleted_row_is_restored_by_the_nightly_sync(): void
    {
        $id = $this->request(['status' => 'approved']);
        $this->rows($id)->first()->delete();
        $this->assertCount(2, $this->rows($id));

        $this->artisan('attendance:sync-leaves --apply')->assertSuccessful();
        $this->assertCount(3, $this->rows($id));
    }

    public function test_working_on_a_leave_day_is_flagged_for_review_once(): void
    {
        Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-09-15', 'status' => 'present', 'check_in' => '2026-09-15 09:00:00', 'check_out' => '2026-09-15 17:00:00']);
        $this->request(['status' => 'approved']);
        $this->artisan('attendance:sync-leaves --apply')->assertSuccessful();

        $note = Attendance::where('employee_id', $this->employee->id)->whereDate('date', '2026-09-15')->value('notes');
        $this->assertSame(1, substr_count((string) $note, 'Worked on a day of approved'));
    }

    public function test_an_admin_edit_on_a_leave_row_survives_the_sync(): void
    {
        $id = $this->request(['status' => 'approved']);
        $row = $this->rows($id)->first();
        $row->update(['status' => 'present']);

        $this->artisan('attendance:sync-leaves --apply')->assertSuccessful();
        $this->assertSame('present', $row->fresh()->status);
    }

    public function test_monthly_stats_report_leave_days(): void
    {
        $this->request(['status' => 'approved']); // 3 days
        $this->request(['half_day' => true, 'status' => 'approved', 'from_date' => '2026-09-21', 'to_date' => '2026-09-21']);

        $this->getJson("/api/v1/attendance/monthly-stats/{$this->employee->id}/9/2026")
            ->assertOk()
            ->assertJsonPath('data.leave', 3)
            ->assertJsonPath('data.half_day', 1)
            ->assertJsonPath('data.leave_days', 3.5);
    }
}
