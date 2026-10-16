<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Shift;
use App\Models\User;
use App\Services\BiometricSyncService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regression tests for defects found while auditing the attendance module:
 * repeated/late biometric punches, route shadowing, update/store validation,
 * CSV round-trip and list filters.
 */
class AttendanceDefectsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Employee $employee;
    private BiometricDevice $device;
    private Shift $shift;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Audit Co']);
        $this->grantLicense($this->company, ['attendance']);
        AttendancePolicy::create(['name' => 'Default', 'late_after_time' => '09:00:00', 'allow_manual_status_override' => true]);
        $department = Department::create(['name' => 'Sales']);
        $this->shift = Shift::create([
            'company_id' => $this->company->id, 'name' => 'Night', 'start_time' => '20:00:00', 'end_time' => '05:00:00',
            'continues_after_midnight' => true, 'grace_minutes' => 0, 'working_days' => [1, 2, 3, 4, 5, 6, 7], 'is_active' => true,
        ]);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->employee = Employee::create([
            'company_id' => $this->company->id, 'user_id' => $user->id, 'name' => 'Samara Rustam',
            'email' => 'samara@example.com', 'department_id' => $department->id, 'designation' => 'Agent',
            'salary' => 1000, 'status' => 'active', 'shift_id' => $this->shift->id,
        ]);

        $this->device = new BiometricDevice([
            'name' => 'Door', 'connection_type' => 'tcp', 'ip_address' => '192.168.1.50',
            'port' => 4370, 'sync_mode' => 'scheduled', 'timezone' => 'UTC', 'status' => 'online',
        ]);
        $this->device->company_id = $this->company->id;
        $this->device->save();
    }

    private function punch(string $type, string $at, ?Employee $employee = null): void
    {
        app(BiometricSyncService::class)->applyPunchPublic($this->device, ($employee ?? $this->employee)->id, [
            'device_user_id' => '1', 'timestamp' => Carbon::parse($at), 'type' => $type,
        ]);
    }

    private function manager(): User
    {
        return $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $this->company->id]);
    }

    // ---- biometric punches -------------------------------------------------------------

    public function test_repeated_checkout_punch_does_not_create_a_next_day_row(): void
    {
        $this->punch('in', '2026-10-13 19:56:00');
        $this->punch('out', '2026-10-14 05:02:00');
        $this->punch('out', '2026-10-14 05:02:00'); // agent re-delivers the same punch

        $rows = Attendance::where('employee_id', $this->employee->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame('2026-10-14 05:02:00', $rows->first()->check_out->toDateTimeString());
        $this->assertSame('present', $rows->first()->status);
    }

    public function test_later_checkout_after_shift_closed_extends_the_same_record(): void
    {
        $this->punch('in', '2026-10-13 19:56:00');
        $this->punch('out', '2026-10-14 05:40:00');
        $this->punch('out', '2026-10-14 06:49:00');

        $rows = Attendance::where('employee_id', $this->employee->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame('2026-10-14 06:49:00', $rows->first()->check_out->toDateTimeString());
    }

    public function test_earlier_out_of_order_checkout_does_not_shorten_or_duplicate(): void
    {
        $this->punch('in', '2026-10-13 20:03:00');
        $this->punch('out', '2026-10-14 05:02:00');
        $this->punch('out', '2026-10-14 05:01:00');

        $rows = Attendance::where('employee_id', $this->employee->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame('2026-10-14 05:02:00', $rows->first()->check_out->toDateTimeString());
    }

    public function test_afternoon_punch_after_a_closed_night_shift_starts_a_new_record(): void
    {
        $this->punch('in', '2026-10-14 20:09:00');
        $this->punch('out', '2026-10-15 05:41:00');
        $this->punch('in', '2026-10-15 14:57:00'); // early arrival for the next night

        $this->assertSame('2026-10-15 05:41:00', Attendance::whereDate('date', '2026-10-14')->first()->check_out->toDateTimeString());
        $next = Attendance::whereDate('date', '2026-10-15')->first();
        $this->assertNotNull($next);
        $this->assertSame('2026-10-15 14:57:00', $next->check_in->toDateTimeString());
    }

    public function test_repair_command_folds_a_duplicate_out_only_row_into_the_closed_shift(): void
    {
        Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-13', 'status' => 'present',
            'check_in' => '2026-10-13 20:03:00', 'check_out' => '2026-10-14 05:02:00']);
        Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-14', 'status' => 'missing_check_in',
            'check_out' => '2026-10-14 05:01:00', 'notes' => 'Check-in missing: only a check-out punch (05:01) was recorded.']);

        $this->artisan('attendance:repair-overnight', ['--apply' => true])->assertSuccessful();

        $this->assertSame(1, Attendance::where('employee_id', $this->employee->id)->count());
        $this->assertSame('2026-10-14 05:02:00', Attendance::first()->check_out->toDateTimeString());
    }

    // ---- routes ------------------------------------------------------------------------

    public function test_policy_endpoints_are_reachable(): void
    {
        Sanctum::actingAs($this->manager());

        $this->getJson('/api/v1/attendance/policy')->assertOk()->assertJsonPath('data.name', 'Default');
        $this->putJson('/api/v1/attendance/policy', ['late_after_time' => '10:30', 'allow_manual_status_override' => false])
            ->assertOk();
        $this->assertSame('10:30:00', AttendancePolicy::where('company_id', $this->company->id)->first()->late_after_time);
    }

    // ---- manual create / update --------------------------------------------------------

    public function test_update_rejects_a_check_in_that_ends_up_after_the_existing_check_out(): void
    {
        $day = Employee::create([
            'company_id' => $this->company->id, 'user_id' => User::factory()->create(['company_id' => $this->company->id])->id,
            'name' => 'Day Worker', 'email' => 'day@example.com', 'department_id' => $this->employee->department_id,
            'designation' => 'Agent', 'salary' => 1000, 'status' => 'active',
        ]);
        $record = Attendance::create(['employee_id' => $day->id, 'date' => '2026-10-14', 'status' => 'present',
            'check_in' => '2026-10-14 09:00:00', 'check_out' => '2026-10-14 17:00:00']);

        Sanctum::actingAs($this->manager());
        $this->putJson("/api/v1/attendance/{$record->id}", ['check_in' => '18:00'])->assertStatus(422);

        $this->assertSame('2026-10-14 09:00:00', $record->fresh()->check_in->toDateTimeString());
    }

    public function test_manual_record_with_only_a_check_out_is_flagged_missing_check_in(): void
    {
        Sanctum::actingAs($this->manager());

        $this->postJson('/api/v1/attendance', [
            'employee_id' => $this->employee->id, 'date' => '2026-10-14', 'check_out' => '05:10',
        ])->assertCreated();

        $this->assertSame('missing_check_in', Attendance::first()->status);
    }

    // ---- list filters ------------------------------------------------------------------

    public function test_blank_filter_params_do_not_hide_every_record(): void
    {
        Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-10-14', 'status' => 'present',
            'check_in' => '2026-10-14 20:00:00', 'check_out' => '2026-10-15 05:00:00']);

        Sanctum::actingAs($this->manager());
        $this->getJson('/api/v1/attendance?date=&month=&year=&employee_id=')->assertOk()->assertJsonPath('data.total', 1);
    }

    // ---- CSV round-trip ----------------------------------------------------------------

    public function test_exported_csv_can_be_imported_back_by_employee_name(): void
    {
        $csv = "employee_number,employee_name,date,check_in,check_out,status,work_from_home,source,notes\n"
            . ",\"Samara Rustam\",2026-10-13,20:03,05:02,present,no,biometric,\n"
            . ",\"Nobody Here\",2026-10-13,20:03,05:02,present,no,biometric,\n";

        Sanctum::actingAs($this->manager());
        $response = $this->postJson('/api/v1/attendance/import', [
            'file' => UploadedFile::fake()->createWithContent('attendance.csv', $csv),
        ])->assertOk();

        $this->assertSame(1, $response->json('data.imported'));
        $this->assertSame(1, $response->json('data.skipped'));
        $row = Attendance::first();
        $this->assertSame('2026-10-14 05:02:00', $row->check_out->toDateTimeString());
        $this->assertSame('biometric', $row->source);
    }
}
