<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\NotificationItem;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceAlertsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Employee $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Acme HR']);
        $this->manager = $this->employee('Boss');
    }

    private function employee(string $name, ?Employee $manager = null): Employee
    {
        $user = User::factory()->create(['company_id' => $this->company->id]);

        return Employee::create([
            'user_id' => $user->id,
            'company_id' => $this->company->id,
            'name' => $name,
            'email' => strtolower($name) . '@example.com',
            'department_id' => Department::firstOrCreate(['name' => 'Ops'])->id,
            'designation' => 'Staff',
            'salary' => 1000,
            'status' => 'active',
            'manager_id' => $manager?->id,
        ]);
    }

    private function types(User $user): array
    {
        return NotificationItem::where('user_id', $user->id)->pluck('type')->all();
    }

    public function test_absence_and_missing_punch_notify_employee_and_manager_once(): void
    {
        $emp = $this->employee('Ali', $this->manager);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-14', 'status' => 'absent']);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-15', 'check_in' => '2026-09-15 09:00:00', 'status' => 'missing_check_out']);

        $this->artisan('attendance:notify-exceptions', ['--days' => 60, '--force' => true])->assertSuccessful();
        $this->artisan('attendance:notify-exceptions', ['--days' => 60, '--force' => true])->assertSuccessful();

        $this->assertEqualsCanonicalizing(['attendance_absent', 'attendance_missing_check_out'], $this->types($emp->user));
        $this->assertEqualsCanonicalizing(['attendance_absent_team', 'attendance_missing_check_out_team'], $this->types($this->manager->user));
    }

    public function test_manual_absences_are_not_announced(): void
    {
        $emp = $this->employee('Bea', $this->manager);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-14', 'status' => 'absent', 'status_reason' => 'manual']);

        app(\App\Services\AttendanceNotificationService::class)
            ->dailyExceptions(Carbon::parse('2026-09-01'), Carbon::parse('2026-09-30'));

        $this->assertSame(0, NotificationItem::count());
    }

    public function test_repeated_lates_alert_at_threshold_only(): void
    {
        $emp = $this->employee('Cy', $this->manager);
        $few = $this->employee('Di', $this->manager);
        foreach (['2026-09-01', '2026-09-02', '2026-09-03'] as $d) {
            Attendance::create(['employee_id' => $emp->id, 'date' => $d, 'status' => 'late']);
        }
        Attendance::create(['employee_id' => $few->id, 'date' => '2026-09-01', 'status' => 'late']);

        $service = app(\App\Services\AttendanceNotificationService::class);
        $this->assertSame(2, $service->repeatedLates(Carbon::parse('2026-09-10')));
        $this->assertSame(0, $service->repeatedLates(Carbon::parse('2026-09-10')));

        $this->assertSame(['attendance_repeated_late'], $this->types($emp->user));
        $this->assertSame(['attendance_repeated_late_team'], $this->types($this->manager->user));
        $this->assertSame([], $this->types($few->user));
    }

    public function test_stale_device_alerts_hr_once_then_reports_recovery(): void
    {
        $hr = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);

        $device = BiometricDevice::create([
            'name' => 'Front door', 'company_id' => $this->company->id, 'connection_type' => 'tcp',
            'sync_mode' => 'scheduled', 'sync_interval_minutes' => 15, 'status' => 'online',
            'last_sync_at' => now()->subHours(5),
        ]);

        $this->artisan('biometric:check-stale')->assertSuccessful();
        $this->artisan('biometric:check-stale')->assertSuccessful();
        $this->assertSame(['biometric_device_stale'], $this->types($hr));

        $device->update(['last_sync_at' => now()]);
        $this->artisan('biometric:check-stale')->assertSuccessful();
        $this->assertSame(['biometric_device_stale', 'biometric_device_recovered'], $this->types($hr));
        $this->assertNull($device->fresh()->stale_alerted_at);
    }

    public function test_healthy_device_sends_nothing(): void
    {
        BiometricDevice::create([
            'name' => 'Lobby', 'company_id' => $this->company->id, 'connection_type' => 'tcp',
            'sync_mode' => 'scheduled', 'status' => 'online', 'last_sync_at' => now()->subMinutes(20),
        ]);

        $this->artisan('biometric:check-stale')->assertSuccessful();
        $this->assertSame(0, NotificationItem::count());
    }

    public function test_no_manager_falls_back_to_hr(): void
    {
        $hr = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        $emp = $this->employee('Fay');
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-14', 'status' => 'absent']);

        $this->artisan('attendance:notify-exceptions', ['--days' => 60, '--force' => true])->assertSuccessful();

        $this->assertSame(['attendance_absent_team'], $this->types($hr));
    }

    public function test_company_can_turn_alerts_off_and_set_its_own_late_threshold(): void
    {
        $emp = $this->employee('Gus', $this->manager);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-14', 'status' => 'absent']);
        foreach (['2026-09-01', '2026-09-02'] as $d) {
            Attendance::create(['employee_id' => $emp->id, 'date' => $d, 'status' => 'late']);
        }
        $policy = \App\Models\AttendancePolicy::create(['company_id' => $this->company->id, 'name' => 'p', 'late_after_time' => '09:15:00', 'late_alert_threshold' => 2]);
        $service = app(\App\Services\AttendanceNotificationService::class);

        $this->assertSame(2, $service->repeatedLates(Carbon::parse('2026-09-10'), (string) $this->company->id));

        $policy->update(['alerts_enabled' => false]);
        app(\App\Services\AttendancePolicyResolver::class)->forget();
        NotificationItem::query()->delete();

        $this->assertSame(0, $service->dailyExceptions(Carbon::parse('2026-09-01'), Carbon::parse('2026-09-30')));
        $this->assertSame(0, $service->repeatedLates(Carbon::parse('2026-09-10')));
    }

    public function test_early_leaves_count_as_lates_when_the_policy_says_so(): void
    {
        $emp = $this->employee('Hal', $this->manager);
        \App\Models\AttendancePolicy::create([
            'company_id' => $this->company->id, 'name' => 'p', 'late_after_time' => '09:15:00',
            'early_leave_enabled' => true, 'early_leave_counts_as_late' => true, 'early_leave_before_time' => '17:00:00',
            'late_alert_threshold' => 2,
        ]);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-01', 'check_in' => '2026-09-01 09:00:00', 'check_out' => '2026-09-01 15:00:00', 'status' => 'present']);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-02', 'check_in' => '2026-09-02 09:30:00', 'status' => 'late']);

        $this->assertSame(2, app(\App\Services\AttendanceNotificationService::class)->repeatedLates(Carbon::parse('2026-09-10')));
    }

    public function test_device_with_monitoring_off_is_never_reported(): void
    {
        $hr = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        BiometricDevice::create([
            'name' => 'Spare', 'company_id' => $this->company->id, 'connection_type' => 'tcp',
            'sync_mode' => 'scheduled', 'status' => 'offline', 'last_sync_at' => now()->subDays(9), 'monitor_sync' => false,
        ]);

        $this->artisan('biometric:check-stale')->assertSuccessful();
        $this->assertSame([], $this->types($hr));
    }

    public function test_company_stale_window_overrides_the_default(): void
    {
        $hr = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        \App\Models\AttendancePolicy::create(['company_id' => $this->company->id, 'name' => 'p', 'late_after_time' => '09:15:00', 'device_stale_minutes' => 60]);
        BiometricDevice::create([
            'name' => 'Gate', 'company_id' => $this->company->id, 'connection_type' => 'tcp',
            'sync_mode' => 'scheduled', 'sync_interval_minutes' => 15, 'status' => 'online', 'last_sync_at' => now()->subMinutes(90),
        ]);

        $this->artisan('biometric:check-stale')->assertSuccessful();
        $this->assertSame(['biometric_device_stale'], $this->types($hr));
    }

    public function test_notifications_wait_for_the_company_local_daytime(): void
    {
        $this->company->update(['timezone' => 'Pacific/Kiritimati']); // UTC+14
        $emp = $this->employee('Ivy', $this->manager);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-14', 'status' => 'absent']);

        $this->travelTo(Carbon::parse('2026-09-15 18:00:00', 'Pacific/Kiritimati')); // 18:00 local: inside the window
        $this->artisan('attendance:notify-exceptions')->assertSuccessful();
        $this->assertSame(['attendance_absent'], $this->types($emp->user));

        NotificationItem::query()->delete();
        $this->travelTo(Carbon::parse('2026-09-16 03:00:00', 'Pacific/Kiritimati')); // 03:00 local: quiet hours
        $this->artisan('attendance:notify-exceptions')->assertSuccessful();
        $this->assertSame([], $this->types($emp->user));
    }

    public function test_missing_check_out_is_judged_in_the_company_timezone(): void
    {
        $this->company->update(['timezone' => 'Asia/Karachi']); // UTC+5; the app clock is UTC
        $emp = $this->employee('Jo', $this->manager);
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-15', 'check_in' => '2026-09-15 09:00:00', 'status' => 'present']);

        // 23:00 Karachi on the 16th is 18:00 UTC: day 15 is over locally (no shift), but it was not yet over by the UTC clock's "end of 16th".
        $this->travelTo(Carbon::parse('2026-09-16 18:30:00', 'UTC'));
        app(\App\Services\AttendanceAbsenceService::class)->markMissingPunches(Carbon::parse('2026-09-14'), (string) $this->company->id);
        $this->assertSame('present', Attendance::where('employee_id', $emp->id)->value('status'));

        $this->travelTo(Carbon::parse('2026-09-16 19:30:00', 'UTC')); // 00:30 Karachi on the 17th
        app(\App\Services\AttendanceAbsenceService::class)->markMissingPunches(Carbon::parse('2026-09-14'), (string) $this->company->id);
        $this->assertSame('missing_check_out', Attendance::where('employee_id', $emp->id)->value('status'));
    }

    public function test_device_alerts_skip_people_who_cannot_open_the_devices_page(): void
    {
        $hr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]); // no biometric:view
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        BiometricDevice::create([
            'name' => 'Gate', 'company_id' => $this->company->id, 'connection_type' => 'tcp',
            'sync_mode' => 'scheduled', 'status' => 'online', 'last_sync_at' => now()->subHours(9),
        ]);

        $this->artisan('biometric:check-stale')->assertSuccessful();

        $this->assertSame([], $this->types($hr));
        $this->assertSame(['biometric_device_stale'], $this->types($admin));
        $this->assertSame('/attendance/biometric-devices', NotificationItem::where('user_id', $admin->id)->value('link'));
    }
}
