<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Shift;
use App\Models\User;
use App\Services\AttendanceAbsenceService;
use App\Services\BiometricSyncService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MissingPunchStatusTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Employee $employee;
    private BiometricDevice $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Night Co']);
        $shift = Shift::create([
            'company_id' => $this->company->id,
            'name' => 'Night Shift',
            'start_time' => '20:00:00',
            'end_time' => '05:00:00',
            'continues_after_midnight' => true,
            'grace_minutes' => 0,
            'working_days' => [1, 2, 3, 4, 5],
            'is_active' => true,
        ]);
        $user = User::factory()->create(['company_id' => $this->company->id]);
        $this->employee = Employee::create([
            'user_id' => $user->id,
            'company_id' => $this->company->id,
            'name' => 'Night Owl',
            'email' => 'owl@example.com',
            'department_id' => Department::create(['name' => 'Ops'])->id,
            'designation' => 'Staff',
            'salary' => 1000,
            'status' => 'active',
            'shift_id' => $shift->id,
        ]);
        $this->device = BiometricDevice::create([
            'name' => 'Door', 'company_id' => $this->company->id, 'status' => 'online',
        ]);
    }

    private function punch(string $at, string $type): void
    {
        app(BiometricSyncService::class)->applyPunchPublic($this->device, $this->employee->id, [
            'device_user_id' => '1',
            'timestamp' => Carbon::createFromFormat('Y-m-d H:i:s', $at),
            'type' => $type,
        ]);
    }

    public function test_morning_checkout_without_evening_checkin_is_filed_on_shift_day_as_missing_check_in(): void
    {
        $this->punch('2026-10-15 06:49:00', 'out');

        $record = Attendance::where('employee_id', $this->employee->id)->sole();
        $this->assertSame('2026-10-14', $record->date->toDateString());
        $this->assertNull($record->check_in);
        $this->assertSame('missing_check_in', $record->status);
        $this->assertStringContainsString('06:49', $record->notes);
    }

    public function test_complete_night_shift_is_unaffected(): void
    {
        $this->punch('2026-10-14 20:04:00', 'in');
        $this->punch('2026-10-15 05:10:00', 'out');

        $record = Attendance::where('employee_id', $this->employee->id)->sole();
        $this->assertSame('2026-10-14', $record->date->toDateString());
        $this->assertContains($record->status, ['present', 'late']);
        $this->assertNotNull($record->check_out);
    }

    public function test_unclosed_night_shift_is_flagged_after_shift_end_and_recovers_on_late_punch(): void
    {
        $this->punch('2026-10-14 20:04:00', 'in');

        Carbon::setTestNow('2026-10-15 07:00:00'); // before 05:00 + 3h buffer
        app(AttendanceAbsenceService::class)->markMissingPunches(Carbon::parse('2026-10-14'));
        $this->assertContains(Attendance::first()->status, ['present', 'late']);

        Carbon::setTestNow('2026-10-15 09:00:00');
        app(AttendanceAbsenceService::class)->markMissingPunches(Carbon::parse('2026-10-14'));
        $this->assertSame('missing_check_out', Attendance::first()->status);

        $this->punch('2026-10-15 09:30:00', 'out');
        $record = Attendance::first();
        $this->assertNotNull($record->check_out);
        $this->assertContains($record->status, ['present', 'late']);

        Carbon::setTestNow();
    }

    public function test_sweep_reclassifies_existing_checkout_only_rows(): void
    {
        Attendance::create([
            'employee_id' => $this->employee->id,
            'date' => '2026-10-15',
            'check_out' => '2026-10-15 06:49:00',
            'status' => 'present',
        ]);

        app(AttendanceAbsenceService::class)->markMissingPunches(Carbon::parse('2026-10-14'));

        $this->assertSame('missing_check_in', Attendance::first()->status);
    }

    public function test_morning_checkout_replaces_auto_marked_absent_row_on_shift_day(): void
    {
        Attendance::create([
            'employee_id' => $this->employee->id, 'date' => '2026-10-14',
            'status' => 'absent', 'notes' => 'Auto-marked absent: no check-in/check-out and no approved leave.',
        ]);

        $this->punch('2026-10-15 06:49:00', 'out');

        $record = Attendance::where('employee_id', $this->employee->id)->sole();
        $this->assertSame('2026-10-14', $record->date->toDateString());
        $this->assertSame('missing_check_in', $record->status);
        $this->assertStringStartsWith('Check-in missing', $record->notes);
    }

    public function test_no_shift_night_worker_checkout_is_filed_on_previous_day(): void
    {
        $this->employee->update(['shift_id' => null]);
        Attendance::create([
            'employee_id' => $this->employee->id, 'date' => '2026-10-13',
            'check_in' => '2026-10-13 20:05:00', 'check_out' => '2026-10-14 05:00:00', 'status' => 'present',
        ]);

        $this->punch('2026-10-15 06:49:00', 'out');

        $record = Attendance::where('employee_id', $this->employee->id)->whereNull('check_in')->sole();
        $this->assertSame('2026-10-14', $record->date->toDateString());
        $this->assertSame('missing_check_in', $record->status);
    }

    public function test_repair_moves_existing_orphan_rows_to_shift_day(): void
    {
        Attendance::create([
            'employee_id' => $this->employee->id, 'date' => '2026-10-14',
            'status' => 'absent', 'notes' => 'Auto-marked absent: x',
        ]);
        Attendance::create([
            'employee_id' => $this->employee->id, 'date' => '2026-10-15',
            'check_out' => '2026-10-15 06:49:00', 'status' => 'present',
        ]);

        $this->artisan('attendance:repair-overnight')->assertSuccessful();
        $this->assertSame('2026-10-15', Attendance::whereNotNull('check_out')->sole()->date->toDateString());

        $this->artisan('attendance:repair-overnight', ['--apply' => true])->assertSuccessful();

        $record = Attendance::sole();
        $this->assertSame('2026-10-14', $record->date->toDateString());
        $this->assertSame('missing_check_in', $record->status);
        $this->assertNotNull($record->check_out);
    }
}
