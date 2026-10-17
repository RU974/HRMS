<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendanceHistory;
use App\Models\AttendancePolicy;
use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use App\Services\AttendanceAbsenceService;
use App\Services\BiometricSyncService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Closed months, "edited by / at", and the per-record change history. */
class AttendancePeriodLockTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Employee $employee;
    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Lock Co']);
        $this->grantLicense($this->company, ['attendance']);
        AttendancePolicy::create(['name' => 'Default', 'late_after_time' => '09:00:00', 'allow_manual_status_override' => true]);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->employee = Employee::create([
            'company_id' => $this->company->id, 'user_id' => $user->id, 'department_id' => Department::create(['name' => 'Ops'])->id, 'name' => 'Lena Lock',
            'email' => 'lena@example.com', 'designation' => 'Agent', 'salary' => 1000, 'status' => 'active',
        ]);
        $this->manager = $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $this->company->id]);
    }

    private function record(string $date = '2026-09-10'): Attendance
    {
        return Attendance::create([
            'employee_id' => $this->employee->id, 'date' => $date, 'check_in' => "$date 09:00:00",
            'check_out' => "$date 17:00:00", 'status' => 'present',
        ]);
    }

    private function runPayroll(string $status = 'draft', int $month = 9): Payroll
    {
        return Payroll::create([
            'employee_id' => $this->employee->id, 'month' => $month, 'year' => 2026, 'base_salary' => 1000,
            'allowances' => 0, 'bonus' => 0, 'deductions' => 0, 'tax' => 0, 'net_salary' => 1000, 'status' => $status,
        ]);
    }

    // ---- payroll closes the month ---------------------------------------------------------

    public function test_attendance_cannot_be_edited_once_payroll_has_run_for_the_month(): void
    {
        $row = $this->record();
        $this->runPayroll('approved');
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/v1/attendance/{$row->id}", ['status' => 'absent'])
            ->assertStatus(423)->assertJsonPath('success', false);
        $this->deleteJson("/api/v1/attendance/{$row->id}")->assertStatus(423);
        $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-09-11', 'status' => 'present'])
            ->assertStatus(423);

        $this->assertSame('present', $row->fresh()->status);
        $this->assertSame(1, Attendance::count());
    }

    public function test_a_draft_payroll_also_closes_the_month_and_deleting_it_reopens_it(): void
    {
        $row = $this->record();
        $payroll = $this->runPayroll('draft');
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'x'])->assertStatus(423);

        $payroll->delete();
        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'x'])->assertOk();
    }

    public function test_a_cancelled_payroll_does_not_close_the_month(): void
    {
        $row = $this->record();
        $this->runPayroll('cancelled');
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'ok'])->assertOk();
    }

    public function test_other_months_and_other_employees_stay_open(): void
    {
        $this->runPayroll('paid', 8);
        $row = $this->record('2026-09-10');
        $other = Employee::create([
            'company_id' => $this->company->id, 'department_id' => $this->employee->department_id,
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id])->id, 'name' => 'Otto Open', 'email' => 'otto@example.com',
            'designation' => 'Agent', 'salary' => 1000, 'status' => 'active',
        ]);
        $this->runPayroll('paid', 9);
        $theirs = Attendance::create(['employee_id' => $other->id, 'date' => '2026-09-10', 'status' => 'present']);
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/v1/attendance/{$theirs->id}", ['notes' => 'fine'])->assertOk();
        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'blocked'])->assertStatus(423);
    }

    public function test_moving_a_record_into_or_out_of_a_closed_month_is_refused(): void
    {
        $open = $this->record('2026-10-05');
        $this->runPayroll('paid', 9);
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/v1/attendance/{$open->id}", ['date' => '2026-09-20'])->assertStatus(423);

        $closed = Attendance::withoutEvents(fn () => Attendance::create([
            'employee_id' => $this->employee->id, 'date' => '2026-09-02', 'status' => 'present',
        ]));
        $this->putJson("/api/v1/attendance/{$closed->id}", ['date' => '2026-10-02'])->assertStatus(423);
    }

    public function test_csv_import_skips_rows_in_a_closed_month(): void
    {
        $this->runPayroll('paid', 9);
        Sanctum::actingAs($this->manager);
        $csv = "employee_number,employee_name,date,check_in,check_out,status\n,Lena Lock,2026-09-15,09:00,17:00,present\n,Lena Lock,2026-10-15,09:00,17:00,present\n";
        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('a.csv', $csv);

        $response = $this->postJson('/api/v1/attendance/import', ['file' => $file])->assertOk();
        $this->assertSame(1, $response->json('data.imported'));
        $this->assertSame(1, $response->json('data.skipped'));
        $this->assertDatabaseMissing('attendances', ['employee_id' => $this->employee->id, 'date' => '2026-09-15']);
    }

    public function test_background_writers_skip_closed_months_without_failing(): void
    {
        $row = Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-09-14', 'check_in' => '2026-09-14 09:00:00', 'status' => 'present']);
        $this->runPayroll('paid', 9);

        // Biometric punch for a closed day.
        $device = new BiometricDevice(['name' => 'Door', 'connection_type' => 'tcp', 'ip_address' => '10.0.0.5', 'port' => 4370, 'sync_mode' => 'scheduled', 'timezone' => 'UTC', 'status' => 'online']);
        $device->company_id = $this->company->id;
        $device->save();
        app(BiometricSyncService::class)->applyPunchPublic($device, $this->employee->id, [
            'device_user_id' => '1', 'timestamp' => Carbon::parse('2026-09-14 17:30:00'), 'type' => 'out',
        ]);
        $this->assertNull($row->fresh()->check_out);

        // Auto-absence for a closed day creates nothing.
        $marked = app(AttendanceAbsenceService::class)->markDay(Carbon::parse('2026-09-16'), (string) $this->company->id, $this->employee->id);
        $this->assertSame(0, $marked);
        $this->assertDatabaseMissing('attendances', ['employee_id' => $this->employee->id, 'date' => '2026-09-16']);
    }

    // ---- manual locks ---------------------------------------------------------------------

    public function test_admin_can_lock_and_unlock_a_month_with_a_reason(): void
    {
        $row = $this->record();
        Sanctum::actingAs($this->manager);

        $this->postJson('/api/v1/attendance/period-locks', ['month' => 9, 'year' => 2026, 'reason' => 'Payroll cut-off'])->assertCreated();
        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'x'])->assertStatus(423);

        $months = $this->getJson('/api/v1/attendance/period-locks?year=2026')->assertOk()->json('data');
        $this->assertTrue($months[8]['locked']);
        $this->assertSame('Payroll cut-off', $months[8]['reason']);
        $this->assertFalse($months[7]['locked']);

        $this->postJson('/api/v1/attendance/period-locks/unlock', ['month' => 9, 'year' => 2026])->assertStatus(422); // reason required
        $this->postJson('/api/v1/attendance/period-locks/unlock', ['month' => 9, 'year' => 2026, 'reason' => 'Late fix'])->assertOk();
        $this->putJson("/api/v1/attendance/{$row->id}", ['notes' => 'x'])->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'attendance_period_unlocked']);
    }

    public function test_a_month_that_has_not_started_cannot_be_locked_and_employees_cannot_lock(): void
    {
        Sanctum::actingAs($this->manager);
        $next = now()->addMonth();
        $this->postJson('/api/v1/attendance/period-locks', ['month' => $next->month, 'year' => $next->year])->assertStatus(422);

        Sanctum::actingAs($this->employee->user);
        $this->postJson('/api/v1/attendance/period-locks', ['month' => 9, 'year' => 2026])->assertForbidden();
        $this->getJson('/api/v1/attendance/history')->assertForbidden();
    }

    // ---- edited by / at + history ---------------------------------------------------------

    public function test_edits_stamp_the_editor_and_write_a_change_history(): void
    {
        $row = $this->record();
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/v1/attendance/{$row->id}", ['check_out' => '18:00', 'reason' => 'Forgot to punch out'])->assertOk()
            ->assertJsonPath('data.edited_by', $this->manager->id)->assertJsonPath('data.edited_by_name', $this->manager->name);

        $fresh = $row->fresh();
        $this->assertSame($this->manager->id, (int) $fresh->edited_by);
        $this->assertNotNull($fresh->edited_at);
        $this->assertSame('manual', $fresh->edited_source);

        $history = $this->getJson("/api/v1/attendance/{$row->id}/history")->assertOk()->json('data');
        $this->assertSame(['created', 'updated'], array_reverse(array_column($history, 'action')));
        $update = $history[0];
        $this->assertSame('Forgot to punch out', $update['reason']);
        $this->assertSame($this->manager->id, $update['user_id']);
        $this->assertArrayHasKey('check_out', $update['changes']);
        $this->assertSame('2026-09-10 17:00:00', $update['changes']['check_out'][0]);
        $this->assertSame('2026-09-10 18:00:00', $update['changes']['check_out'][1]);
    }

    public function test_deleted_records_keep_their_history_in_the_company_log(): void
    {
        $row = $this->record();
        Sanctum::actingAs($this->manager);

        $this->deleteJson("/api/v1/attendance/{$row->id}", ['reason' => 'Duplicate'])->assertOk();

        $log = $this->getJson('/api/v1/attendance/history?action=deleted')->assertOk()->json('data.data');
        $this->assertCount(1, $log);
        $this->assertSame($row->id, $log[0]['attendance_id']);
        $this->assertSame('Duplicate', $log[0]['reason']);
        $this->assertSame('present', $log[0]['changes']['status'][0]);
    }

    public function test_system_writes_are_attributed_to_their_source_not_a_person(): void
    {
        $device = new BiometricDevice(['name' => 'Door', 'connection_type' => 'tcp', 'ip_address' => '10.0.0.6', 'port' => 4370, 'sync_mode' => 'scheduled', 'timezone' => 'UTC', 'status' => 'online']);
        $device->company_id = $this->company->id;
        $device->save();
        app(BiometricSyncService::class)->applyPunchPublic($device, $this->employee->id, [
            'device_user_id' => '1', 'timestamp' => Carbon::parse('2026-10-12 09:05:00'), 'type' => 'in',
        ]);

        $row = Attendance::where('employee_id', $this->employee->id)->firstOrFail();
        $this->assertNull($row->edited_by);
        $this->assertSame('biometric', $row->edited_source);
        $this->assertSame('biometric', AttendanceHistory::where('attendance_id', $row->id)->value('source'));
    }

    public function test_untracked_changes_do_not_count_as_an_edit(): void
    {
        $row = $this->record();
        $stamp = $row->fresh()->edited_at;
        $this->travel(5)->minutes();

        $row->shift_snapshot = ['name' => 'Refrozen'];
        $row->save();

        $this->assertEquals($stamp, $row->fresh()->edited_at);
        $this->assertSame(1, AttendanceHistory::where('attendance_id', $row->id)->count());
    }
}
