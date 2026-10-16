<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Shift;
use App\Models\User;
use App\Models\BiometricDevice;
use App\Services\AttendanceAbsenceService;
use App\Services\BiometricSyncService;
use App\Services\PayrollAttendanceService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Early leave, minimum hours, half-day / absent limits, "N lates = 1 absent" and when someone counts as absent. */
class AttendancePolicyRulesTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Employee $employee;
    private Shift $shift;
    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Alpha']);
        $this->grantLicense($this->company, ['attendance']);
        $this->manager = $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $this->company->id]);

        $this->shift = Shift::create([
            'company_id' => $this->company->id, 'name' => 'Day', 'start_time' => '09:00:00', 'end_time' => '17:00:00',
            'grace_minutes' => 0, 'working_days' => [1, 2, 3, 4, 5], 'is_active' => true,
        ]);
        $department = Department::create(['name' => 'Ops']);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->employee = Employee::create([
            'company_id' => $this->company->id, 'user_id' => $user->id, 'name' => 'Alice', 'email' => 'alice@example.com',
            'department_id' => $department->id, 'designation' => 'Agent', 'salary' => 2200, 'status' => 'active',
            'shift_id' => $this->shift->id, 'joining_date' => '2026-01-01',
        ]);
        Sanctum::actingAs($this->manager);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function savePolicy(array $rules = [], int $expect = 200)
    {
        return $this->putJson('/api/v1/attendance/policy', array_merge([
            'late_after_time' => '09:00', 'allow_manual_status_override' => true,
        ], $rules))->assertStatus($expect);
    }

    private function record(string $date, ?string $in, ?string $out, string $status = 'present'): Attendance
    {
        return Attendance::create([
            'employee_id' => $this->employee->id, 'date' => $date, 'status' => $status,
            'check_in' => $in ? "$date $in" : null, 'check_out' => $out ? "$date $out" : null,
        ]);
    }

    public function test_policy_defaults_are_all_off_and_flagged_inherited(): void
    {
        AttendancePolicy::query()->delete();
        $this->getJson('/api/v1/attendance/policy')->assertOk()
            ->assertJsonPath('data.inherited', true)
            ->assertJsonPath('data.early_leave_enabled', false)
            ->assertJsonPath('data.lates_per_absent', 0)
            ->assertJsonPath('data.auto_mark_absent', true)
            ->assertJsonPath('data.full_day_hours', null);
    }

    public function test_rules_validate_against_each_other_and_need_the_permission(): void
    {
        $this->savePolicy(['half_day_hours' => 4], 422);                                   // half without full
        $this->savePolicy(['full_day_hours' => 4, 'half_day_hours' => 4], 422);           // half >= full
        $this->savePolicy(['count_short_as_absent' => true], 422);                         // needs half
        $this->savePolicy(['half_day_after_late_minutes' => 60, 'absent_after_late_minutes' => 30], 422);

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]));
        $this->savePolicy(['half_day_hours' => 4], 403); // 403 before validation
    }

    public function test_rules_are_saved_per_company_and_read_back(): void
    {
        $this->savePolicy([
            'early_leave_enabled' => true, 'early_leave_grace_minutes' => 10, 'early_leave_before_time' => '16:30',
            'full_day_hours' => 8, 'half_day_hours' => 4, 'count_short_as_absent' => true,
            'half_day_after_late_minutes' => 60, 'absent_after_late_minutes' => 180,
            'lates_per_absent' => 3, 'auto_mark_absent' => false, 'missing_punch_as_absent' => true,
        ]);

        $this->getJson('/api/v1/attendance/policy')->assertOk()
            ->assertJsonPath('data.inherited', false)
            ->assertJsonPath('data.early_leave_before_time', '16:30:00')
            ->assertJsonPath('data.full_day_hours', 8)
            ->assertJsonPath('data.lates_per_absent', 3)
            ->assertJsonPath('data.auto_mark_absent', false);
    }

    public function test_arriving_long_after_the_cut_off_is_a_half_day_or_absent_and_follows_corrections(): void
    {
        $this->savePolicy(['half_day_after_late_minutes' => 60, 'absent_after_late_minutes' => 180]);

        $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-10-12', 'check_in' => '09:30'])
            ->assertCreated()->assertJsonPath('data.status', 'late');
        $half = $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-10-13', 'check_in' => '10:30'])
            ->assertCreated()->assertJsonPath('data.status', 'half_day')->json('data.id');
        $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-10-14', 'check_in' => '12:30'])
            ->assertCreated()->assertJsonPath('data.status', 'absent');

        // The punch was entered wrongly: fixing it takes the policy-made half day back off.
        $this->putJson("/api/v1/attendance/{$half}", ['check_in' => '08:55'])->assertOk()->assertJsonPath('data.status', 'present');
    }

    public function test_a_half_day_picked_by_hand_survives_a_time_edit(): void
    {
        $this->savePolicy(['half_day_after_late_minutes' => 60]);
        $id = $this->postJson('/api/v1/attendance', [
            'employee_id' => $this->employee->id, 'date' => '2026-10-13', 'check_in' => '09:00', 'check_out' => '17:00', 'status' => 'half_day',
        ])->assertCreated()->assertJsonPath('data.status', 'half_day')->json('data.id');

        $this->putJson("/api/v1/attendance/{$id}", ['check_out' => '17:30'])->assertOk()->assertJsonPath('data.status', 'half_day');
    }

    public function test_minimum_hours_ladder(): void
    {
        $this->savePolicy(['full_day_hours' => 8, 'half_day_hours' => 4, 'count_short_as_absent' => true]);
        $post = fn (string $date, string $out) => $this->postJson('/api/v1/attendance', [
            'employee_id' => $this->employee->id, 'date' => $date, 'check_in' => '09:00', 'check_out' => $out,
        ])->assertCreated();

        $post('2026-10-12', '17:00')->assertJsonPath('data.status', 'present');
        $post('2026-10-13', '14:00')->assertJsonPath('data.status', 'half_day')->assertJsonPath('data.is_short_hours', true);
        $post('2026-10-14', '11:00')->assertJsonPath('data.status', 'absent');
    }

    public function test_minimum_hours_are_judged_at_check_out(): void
    {
        $this->savePolicy(['full_day_hours' => 8, 'half_day_hours' => 4]);

        Carbon::setTestNow('2026-10-14 09:00:00');
        $this->postJson('/api/v1/attendance/check-in', ['employee_id' => $this->employee->id])->assertOk()->assertJsonPath('data.status', 'present');
        Carbon::setTestNow('2026-10-14 11:00:00');
        $this->postJson('/api/v1/attendance/check-out', ['employee_id' => $this->employee->id])->assertOk();

        $this->assertSame('half_day', Attendance::where('employee_id', $this->employee->id)->value('status'));
    }

    public function test_only_full_day_hours_flags_but_does_not_change_the_status(): void
    {
        $this->savePolicy(['full_day_hours' => 8]);
        $this->postJson('/api/v1/attendance', [
            'employee_id' => $this->employee->id, 'date' => '2026-10-13', 'check_in' => '09:00', 'check_out' => '13:00',
        ])->assertCreated()->assertJsonPath('data.status', 'present')->assertJsonPath('data.is_short_hours', true);
    }

    public function test_early_leave_uses_shift_end_and_grace_and_a_fixed_time_without_a_shift(): void
    {
        $this->savePolicy(['early_leave_enabled' => true, 'early_leave_grace_minutes' => 10, 'early_leave_before_time' => '16:00']);

        $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-10-12', 'check_in' => '09:00', 'check_out' => '16:40'])
            ->assertJsonPath('data.is_early_leave', true);
        $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-10-13', 'check_in' => '09:00', 'check_out' => '16:55'])
            ->assertJsonPath('data.is_early_leave', false);

        $this->employee->update(['shift_id' => null]);
        $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-10-14', 'check_in' => '09:00', 'check_out' => '15:30'])
            ->assertJsonPath('data.is_early_leave', true);
    }

    public function test_n_lates_make_an_absence_in_the_monthly_stats(): void
    {
        $this->savePolicy(['lates_per_absent' => 3, 'early_leave_enabled' => true, 'early_leave_counts_as_late' => true]);
        foreach (['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'] as $d) {
            $this->record($d, '09:30:00', '17:00:00', 'late');
        }
        $this->record('2026-10-07', '09:00:00', '15:00:00'); // early leave counts as a late too → 5 of 3

        $this->getJson("/api/v1/attendance/monthly-stats/{$this->employee->id}/10/2026")->assertOk()
            ->assertJsonPath('data.late', 4)
            ->assertJsonPath('data.early_leave', 1)
            ->assertJsonPath('data.absent_from_lates', 1)
            ->assertJsonPath('data.effective_absent', 1);
    }

    public function test_auto_marking_absent_can_be_turned_off(): void
    {
        $this->savePolicy(['auto_mark_absent' => false]);
        app(AttendanceAbsenceService::class)->markDay(Carbon::parse('2026-10-12'), (string) $this->company->id);
        $this->assertSame(0, Attendance::count());

        $this->savePolicy(['auto_mark_absent' => true]);
        app(AttendanceAbsenceService::class)->markDay(Carbon::parse('2026-10-12'), (string) $this->company->id);
        $this->assertSame(1, Attendance::where('status', 'absent')->count());
    }

    public function test_saving_with_apply_from_rejudges_existing_records(): void
    {
        $this->record('2026-10-13', '10:30:00', '17:00:00', 'late');

        $this->savePolicy(['half_day_after_late_minutes' => 60, 'apply_from' => '2026-10-01'])
            ->assertJsonPath('data.recalculated_records', 1);
        $this->assertSame('half_day', Attendance::value('status'));
        $this->assertSame('policy', Attendance::value('status_reason'));

        // Loosening the rule gives the day back.
        $this->savePolicy(['half_day_after_late_minutes' => null, 'apply_from' => '2026-10-01']);
        $this->assertSame('late', Attendance::value('status'));
    }

    public function test_payroll_counts_policy_absences_and_lates_per_absent(): void
    {
        $this->savePolicy(['lates_per_absent' => 2, 'missing_punch_as_absent' => true]);
        $this->record('2026-09-01', '09:30:00', '17:00:00', 'late');
        $this->record('2026-09-02', '09:30:00', '17:00:00', 'late');
        $this->record('2026-09-03', '09:30:00', '17:00:00', 'late');
        $this->record('2026-09-04', '10:00:00', '17:00:00', 'absent');
        $this->record('2026-09-07', '09:00:00', null, 'missing_check_out');

        // Every other working day of September was a normal present day.
        for ($d = Carbon::parse('2026-09-01'); $d->month === 9; $d->addDay()) {
            if ($d->isWeekday() && !Attendance::whereDate('date', $d->toDateString())->exists()) {
                $this->record($d->toDateString(), '09:00:00', '17:00:00');
            }
        }

        $summary = app(PayrollAttendanceService::class)->summarize($this->employee->fresh(), 9, 2026);

        $this->assertSame(3, $summary['late_count']);
        $this->assertSame(1, $summary['late_blocks']);   // 3 lates / 2 = 1 block
        $this->assertSame(2, $summary['absent_days']);   // the punched absent day + the missing punch
        $this->assertSame(3.0, (float) $summary['unpaid_days']); // 2 absences + 1 late block (an absent day each)
    }

    public function test_company_summary_and_team_view_include_absences_from_lates(): void
    {
        $this->savePolicy(['lates_per_absent' => 2, 'early_leave_enabled' => true, 'early_leave_counts_as_late' => true]);
        $this->record('2026-10-01', '09:30:00', '17:00:00', 'late');
        $this->record('2026-10-02', '09:30:00', '17:00:00', 'late');
        $this->record('2026-10-05', '09:00:00', '15:00:00'); // early leave -> third late-like day, counted once

        $this->getJson('/api/v1/attendance/company-monthly-summary?month=10&year=2026')->assertOk()
            ->assertJsonPath('data.early_leave', 1)
            ->assertJsonPath('data.lates_per_absent', 2)
            ->assertJsonPath('data.absent_from_lates', 1);

        $row = collect($this->getJson('/api/v1/attendance/team-daily?date=2026-10-14')->assertOk()->json('data'))
            ->firstWhere('employee_id', $this->employee->id);
        $this->assertSame(1, $row['absent_from_lates']);
    }

    public function test_an_admin_override_of_a_policy_made_status_is_not_reverted_by_a_later_edit(): void
    {
        $this->savePolicy(['half_day_after_late_minutes' => 60]);
        $id = $this->postJson('/api/v1/attendance', ['employee_id' => $this->employee->id, 'date' => '2026-10-13', 'check_in' => '10:30'])
            ->assertJsonPath('data.status', 'half_day')->json('data.id');

        $this->putJson("/api/v1/attendance/{$id}", ['status' => 'present'])->assertOk()->assertJsonPath('data.status', 'present');
        $this->putJson("/api/v1/attendance/{$id}", ['check_out' => '17:00'])->assertOk()->assertJsonPath('data.status', 'present');

        $this->savePolicy(['half_day_after_late_minutes' => 60, 'apply_from' => '2026-10-01']);
        $this->assertSame('present', Attendance::find($id)->status);
    }

    public function test_biometric_check_out_applies_the_minimum_hours_rule(): void
    {
        $this->savePolicy(['full_day_hours' => 8, 'half_day_hours' => 4]);
        $device = new BiometricDevice([
            'name' => 'Door', 'connection_type' => 'tcp', 'ip_address' => '192.168.1.50',
            'port' => 4370, 'sync_mode' => 'scheduled', 'timezone' => 'UTC', 'status' => 'online',
        ]);
        $device->company_id = $this->company->id;
        $device->save();
        $sync = app(BiometricSyncService::class);

        $sync->applyPunchPublic($device, $this->employee->id, ['device_user_id' => '1', 'timestamp' => Carbon::parse('2026-10-13 09:00:00'), 'type' => 'in']);
        $this->assertSame('present', Attendance::value('status'));
        $sync->applyPunchPublic($device, $this->employee->id, ['device_user_id' => '1', 'timestamp' => Carbon::parse('2026-10-13 12:00:00'), 'type' => 'out']);

        $this->assertSame('half_day', Attendance::value('status'));
        $this->assertSame('policy', Attendance::value('status_reason'));
    }
}
