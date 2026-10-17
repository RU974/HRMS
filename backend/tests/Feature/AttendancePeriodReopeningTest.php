<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendanceHistory;
use App\Models\AttendancePolicy;
use App\Models\BiometricDevice;
use App\Models\BiometricSyncLog;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDeviceMapping;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Reopening a payroll-closed month, dropped-punch reporting, repair commands and the legacy backfill. */
class AttendancePeriodReopeningTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Employee $employee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Reopen Co']);
        $this->grantLicense($this->company, ['attendance', 'payroll']);
        AttendancePolicy::create(['name' => 'Default', 'late_after_time' => '09:00:00', 'allow_manual_status_override' => true]);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->employee = Employee::create([
            'company_id' => $this->company->id, 'user_id' => $user->id, 'department_id' => Department::create(['name' => 'Ops'])->id,
            'name' => 'Rhea Reopen', 'email' => 'rhea@example.com', 'designation' => 'Agent', 'salary' => 1000, 'status' => 'active',
        ]);
        $this->admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
    }

    private function paidRecord(): Attendance
    {
        $row = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-09-10', 'check_in' => '2026-09-10 09:00:00', 'check_out' => '2026-09-10 17:00:00', 'status' => 'present']);
        Payroll::create(['employee_id' => $this->employee->id, 'month' => 9, 'year' => 2026, 'base_salary' => 1000, 'allowances' => 0,
            'bonus' => 0, 'deductions' => 0, 'tax' => 0, 'net_salary' => 1000, 'status' => 'paid']);

        return $row;
    }

    public function test_a_paid_month_can_be_corrected_through_an_audited_reopening(): void
    {
        $row = $this->paidRecord();
        Sanctum::actingAs($this->admin);

        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'x'])->assertStatus(423);

        $this->postJson('/api/v1/attendance/period-reopenings', ['month' => 9, 'year' => 2026, 'employee_id' => $this->employee->id])
            ->assertStatus(422); // reason required
        $this->postJson('/api/v1/attendance/period-reopenings', [
            'month' => 9, 'year' => 2026, 'employee_id' => $this->employee->id, 'reason' => 'Wrong punch found after payout', 'hours' => 2,
        ])->assertCreated();

        $this->putJson("/api/v1/attendance/{$row->id}", ['check_out' => '18:00', 'reason' => 'Corrected after payout'])->assertOk();
        $history = AttendanceHistory::where('attendance_id', $row->id)->where('action', 'updated')->first();
        $this->assertSame('Corrected after payout', $history->reason);
        $this->assertDatabaseHas('audit_logs', ['action' => 'attendance_period_reopened']);

        // Ends by time...
        $this->travel(3)->hours();
        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'late'])->assertStatus(423);
    }

    public function test_reopening_can_be_closed_early_and_only_covers_its_employee(): void
    {
        $row = $this->paidRecord();
        $other = Employee::create([
            'company_id' => $this->company->id, 'department_id' => $this->employee->department_id,
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id])->id,
            'name' => 'Omar Other', 'email' => 'omar@example.com', 'designation' => 'Agent', 'salary' => 1000, 'status' => 'active',
        ]);
        $otherRow = Attendance::create(['employee_id' => $other->id, 'date' => '2026-09-10', 'status' => 'present']);
        Payroll::create(['employee_id' => $other->id, 'month' => 9, 'year' => 2026, 'base_salary' => 1000, 'allowances' => 0,
            'bonus' => 0, 'deductions' => 0, 'tax' => 0, 'net_salary' => 1000, 'status' => 'approved']);
        Sanctum::actingAs($this->admin);

        $id = $this->postJson('/api/v1/attendance/period-reopenings', [
            'month' => 9, 'year' => 2026, 'employee_id' => $this->employee->id, 'reason' => 'Fix one person',
        ])->assertCreated()->json('data.id');

        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'ok'])->assertOk();
        $this->putJson("/api/v1/attendance/{$otherRow->id}", ['notes' => 'no'])->assertStatus(423);

        $this->postJson("/api/v1/attendance/period-reopenings/{$id}/close")->assertOk();
        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'again'])->assertStatus(423);
        $this->assertDatabaseHas('audit_logs', ['action' => 'attendance_period_reclosed']);
    }

    public function test_a_manual_lock_is_not_overridden_by_a_reopening(): void
    {
        $row = $this->paidRecord();
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/attendance/period-locks', ['month' => 9, 'year' => 2026])->assertCreated();
        $this->postJson('/api/v1/attendance/period-reopenings', ['month' => 9, 'year' => 2026, 'reason' => 'Try to force it'])->assertCreated();

        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'x'])->assertStatus(423);
    }

    public function test_reopening_needs_attendance_and_payroll_access(): void
    {
        $this->paidRecord();
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $this->company->id]));
        $this->postJson('/api/v1/attendance/period-reopenings', ['month' => 9, 'year' => 2026, 'reason' => 'No payroll access'])->assertForbidden();

        Sanctum::actingAs($this->employee->user);
        $this->getJson('/api/v1/attendance/period-reopenings')->assertForbidden();
    }

    public function test_dropped_biometric_punches_are_counted_on_the_sync_log(): void
    {
        $this->paidRecord();
        $device = new BiometricDevice(['name' => 'Door', 'connection_type' => 'tcp', 'ip_address' => '10.0.0.9', 'port' => 4370, 'sync_mode' => 'scheduled', 'timezone' => 'UTC', 'status' => 'online']);
        $device->company_id = $this->company->id;
        $device->save();
        EmployeeDeviceMapping::create(['device_id' => $device->id, 'employee_id' => $this->employee->id, 'device_user_id' => '7']);
        config(['services.biometric_agent.secret' => 'agent-secret']);

        $response = $this->withToken('agent-secret')
            ->postJson('/api/v1/auth/biometric-agent/push', [
                'device_id' => $device->id,
                'punches' => [
                    ['device_user_id' => '7', 'timestamp' => '2026-09-10 18:00:00', 'type' => 'out'],
                    ['device_user_id' => '7', 'timestamp' => '2026-10-12 09:00:00', 'type' => 'in'],
                ],
            ]);

        $response->assertOk();
        $log = BiometricSyncLog::latest('id')->first();
        $this->assertSame(1, $log->records_locked);
        $this->assertSame(1, $log->records_matched);
        $this->assertSame('partial', $log->status);
        $this->assertStringContainsString('closed', (string) $log->error_message);
    }

    public function test_repair_commands_skip_closed_months_and_label_their_changes(): void
    {
        // A record whose check-out precedes its check-in, in a closed and in an open month.
        $closed = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-09-10', 'check_in' => '2026-09-10 09:00:00', 'check_out' => '2026-09-10 17:00:00', 'status' => 'present']);
        $open = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-10', 'check_in' => '2026-10-10 09:00:00', 'check_out' => '2026-10-10 17:00:00', 'status' => 'present']);
        DB::table('attendances')->whereIn('id', [$closed->id, $open->id])->update(['check_out' => DB::raw("datetime(check_in, '-1 hour')")]);
        Payroll::create(['employee_id' => $this->employee->id, 'month' => 9, 'year' => 2026, 'base_salary' => 1000, 'allowances' => 0,
            'bonus' => 0, 'deductions' => 0, 'tax' => 0, 'net_salary' => 1000, 'status' => 'paid']);

        $this->artisan('attendance:repair-overnight', ['--apply' => true])->assertSuccessful();

        $this->assertNotNull($closed->fresh()->check_out, 'closed month untouched');
        $this->assertNull($open->fresh()->check_out, 'open month repaired');
        $history = AttendanceHistory::where('attendance_id', $open->id)->where('action', 'updated')->first();
        $this->assertSame('repair', $history->source);
    }

    public function test_recalculation_and_schedule_sync_leave_a_closed_month_alone(): void
    {
        // Policy says 09:00 is late; both records were stored as "present" so a recalculation wants to change them.
        $closed = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-09-10', 'check_in' => '2026-09-10 11:00:00', 'check_out' => '2026-09-10 17:00:00', 'status' => 'present']);
        $open = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-10', 'check_in' => '2026-10-10 11:00:00', 'check_out' => '2026-10-10 17:00:00', 'status' => 'present']);
        \App\Models\Shift::create([
            'company_id' => $this->company->id, 'name' => 'Day', 'start_time' => '09:00:00', 'end_time' => '17:00:00',
            'grace_minutes' => 0, 'working_days' => [1, 2, 3, 4, 5, 6, 7], 'is_active' => true,
        ]);
        $this->employee->update(['shift_id' => \App\Models\Shift::first()->id]);
        DB::table('attendances')->whereIn('id', [$closed->id, $open->id])->update(['shift_snapshot' => null, 'shift_id' => null]);
        Payroll::create(['employee_id' => $this->employee->id, 'month' => 9, 'year' => 2026, 'base_salary' => 1000, 'allowances' => 0,
            'bonus' => 0, 'deductions' => 0, 'tax' => 0, 'net_salary' => 1000, 'status' => 'paid']);

        $changed = app(\App\Services\AttendanceStatusRecalculator::class)->recalculate(\Carbon\Carbon::parse('2026-09-01'), null, null, true, null, null, true);

        $this->assertSame('present', $closed->fresh()->status, 'closed month keeps its recorded status');
        $this->assertNull($closed->fresh()->shift_snapshot, 'and its frozen shift');
        $this->assertSame('late', $open->fresh()->status);
        $this->assertSame(1, $changed, 'only the open record is counted');

        $result = app(\App\Services\ShiftAttendanceSync::class)->refresh(null, \Carbon\Carbon::parse('2026-09-01'), null, null, (string) $this->company->id);
        $this->assertSame('present', $closed->fresh()->status);
        $this->assertIsArray($result);
    }

    public function test_the_legacy_backfill_gives_old_records_a_baseline_and_an_edit_stamp(): void
    {
        $row = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-08-03', 'status' => 'present']);
        // Simulate a record created before this feature existed.
        DB::table('attendance_histories')->delete();
        DB::table('attendances')->where('id', $row->id)->update(['edited_at' => null, 'edited_source' => null]);

        $migration = require database_path('migrations/2026_10_28_000002_add_attendance_reopenings_and_backfill_history.php');
        $migration->up();
        $migration->up(); // idempotent

        $fresh = $row->fresh();
        $this->assertNotNull($fresh->edited_at);
        $this->assertSame('legacy', $fresh->edited_source);
        $this->assertNull($fresh->edited_by);
        $entries = AttendanceHistory::where('attendance_id', $row->id)->get();
        $this->assertCount(1, $entries);
        $this->assertSame('legacy', $entries->first()->source);
        $this->assertSame('present', $entries->first()->changes['status'][1]);
    }
}
