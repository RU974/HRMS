<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\Shift;
use App\Models\ShiftAssignment;
use App\Models\ShiftOverride;
use App\Models\ShiftRotation;
use App\Models\ShiftSwap;
use App\Models\User;
use App\Services\AttendanceAbsenceService;
use App\Services\BiometricSyncService;
use App\Services\LeaveAttendanceSync;
use App\Services\PayrollAttendanceService;
use App\Services\ShiftResolver;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Rosters, rotations, one-day overrides, swaps, and the shift snapshot on attendance.
 * "Today" is Wednesday 2026-10-14.
 */
class ShiftSchedulingTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Company $other;
    private Shift $day;
    private Shift $evening;
    private Shift $night;
    private Employee $a;
    private Employee $b;
    private Employee $outsider;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-14 10:00:00');

        $this->company = Company::create(['name' => 'Rota Co']);
        $this->other = Company::create(['name' => 'Other Co']);
        AttendancePolicy::create(['name' => 'Default', 'late_after_time' => '09:00:00', 'allow_manual_status_override' => true]);

        $this->day = $this->shift($this->company, 'Day', '09:00', '17:00');
        $this->evening = $this->shift($this->company, 'Evening', '14:00', '22:00');
        $this->night = $this->shift($this->company, 'Night', '22:00', '06:00', true);

        $this->a = $this->employee($this->company, 'Alia', $this->day);
        $this->b = $this->employee($this->company, 'Bilal', $this->day);
        $this->outsider = $this->employee($this->other, 'Zed', null);
        $this->admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function shift(Company $company, string $name, string $start, string $end, bool $overnight = false, int $grace = 0): Shift
    {
        return Shift::create([
            'company_id' => $company->id, 'name' => $name, 'start_time' => $start, 'end_time' => $end,
            'continues_after_midnight' => $overnight, 'grace_minutes' => $grace, 'working_days' => [1, 2, 3, 4, 5], 'is_active' => true,
        ]);
    }

    private function employee(Company $company, string $name, ?Shift $shift): Employee
    {
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id]);

        return Employee::create([
            'user_id' => $user->id, 'company_id' => $company->id, 'name' => $name, 'email' => strtolower($name) . '@example.com',
            'department_id' => Department::firstOrCreate(['name' => 'Ops'])->id, 'designation' => 'Staff', 'salary' => 1000,
            'status' => 'active', 'shift_id' => $shift?->id,
        ]);
    }

    private function resolver(): ShiftResolver
    {
        return app(ShiftResolver::class);
    }

    private function on(Employee $employee, string $date): array
    {
        $s = $this->resolver()->on($employee->fresh(), $date);

        return [$s->shift?->name, $s->isWorkingDay, $s->source];
    }

    private function roster(Employee $employee, array $data): void
    {
        ShiftAssignment::create($data + ['company_id' => $employee->company_id, 'employee_id' => $employee->id]);
        $this->resolver()->flush();
    }

    private function rotation(array $shiftIds, string $name = 'Cycle'): ShiftRotation
    {
        $rotation = ShiftRotation::create(['company_id' => $this->company->id, 'name' => $name]);
        foreach ($shiftIds as $position => $shiftId) {
            $rotation->slots()->create(['position' => $position, 'shift_id' => $shiftId]);
        }
        $this->resolver()->flush();

        return $rotation;
    }

    // ── Resolution ─────────────────────────────────────────────────────────────

    public function test_override_beats_roster_beats_default(): void
    {
        $this->roster($this->a, ['shift_id' => $this->evening->id, 'starts_on' => '2026-10-20', 'ends_on' => '2026-10-24']);
        ShiftOverride::create(['company_id' => $this->company->id, 'employee_id' => $this->a->id, 'date' => '2026-10-22', 'shift_id' => null]);
        ShiftOverride::create(['company_id' => $this->company->id, 'employee_id' => $this->a->id, 'date' => '2026-10-23', 'shift_id' => $this->night->id]);

        $this->assertSame(['Day', true, 'default'], $this->on($this->a, '2026-10-19'));
        $this->assertSame(['Evening', true, 'roster'], $this->on($this->a, '2026-10-21'));
        $this->assertSame([null, false, 'override'], $this->on($this->a, '2026-10-22'));
        $this->assertSame(['Night', true, 'override'], $this->on($this->a, '2026-10-23'));
        $this->assertSame(['Day', true, 'default'], $this->on($this->a, '2026-10-26'));
        // Sunday on the default shift is still a weekly off.
        $this->assertSame(['Day', false, 'default'], $this->on($this->a, '2026-10-25'));
    }

    public function test_rotation_cycles_from_its_anchor_and_has_days_off(): void
    {
        $rotation = $this->rotation([$this->day->id, $this->day->id, null, null]);
        $this->roster($this->a, ['shift_rotation_id' => $rotation->id, 'rotation_anchor_date' => '2026-10-14', 'starts_on' => '2026-10-01']);

        $this->assertSame(['Day', true, 'rotation'], $this->on($this->a, '2026-10-14'));
        $this->assertSame(['Day', true, 'rotation'], $this->on($this->a, '2026-10-15'));
        // Saturday and Sunday are working days in a rotation when the pattern says so, and off days are off on weekdays.
        $this->assertSame([null, false, 'rotation'], $this->on($this->a, '2026-10-16'));
        $this->assertSame([null, false, 'rotation'], $this->on($this->a, '2026-10-17'));
        $this->assertSame(['Day', true, 'rotation'], $this->on($this->a, '2026-10-18'));
        // Before the anchor the pattern runs backwards: Oct 13 is slot 3 and Oct 12 slot 2 (off), Oct 11 slot 1 (work).
        $this->assertSame([null, false, 'rotation'], $this->on($this->a, '2026-10-13'));
        $this->assertSame([null, false, 'rotation'], $this->on($this->a, '2026-10-12'));
        $this->assertSame(['Day', true, 'rotation'], $this->on($this->a, '2026-10-11'));
    }

    public function test_no_shift_anywhere_falls_back_to_monday_to_friday(): void
    {
        $this->assertSame([null, true, 'none'], $this->on($this->outsider, '2026-10-14'));
        $this->assertSame([null, false, 'none'], $this->on($this->outsider, '2026-10-17'));
    }

    // ── Roster API ─────────────────────────────────────────────────────────────

    public function test_new_assignment_trims_and_splits_overlapping_ones(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/shifts/assignments', ['employee_ids' => [$this->a->id], 'shift_id' => $this->evening->id, 'starts_on' => '2026-10-14'])->assertCreated();
        $this->postJson('/api/v1/shifts/assignments', ['employee_ids' => [$this->a->id], 'shift_id' => $this->night->id, 'starts_on' => '2026-10-20', 'ends_on' => '2026-10-22'])
            ->assertCreated()->assertJsonPath('data.replaced', 1);

        $this->assertSame(3, ShiftAssignment::where('employee_id', $this->a->id)->count());
        $this->resolver()->flush();
        $this->assertSame('Evening', $this->on($this->a, '2026-10-19')[0]);
        $this->assertSame('Night', $this->on($this->a, '2026-10-21')[0]);
        $this->assertSame('Evening', $this->on($this->a, '2026-10-23')[0]);
    }

    public function test_assignment_needs_exactly_one_of_shift_or_rotation_and_an_active_company_shift(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/shifts/assignments', ['employee_ids' => [$this->a->id], 'starts_on' => '2026-10-14'])->assertStatus(422);

        $foreign = $this->shift($this->other, 'Foreign', '08:00', '16:00');
        $this->postJson('/api/v1/shifts/assignments', ['employee_ids' => [$this->a->id], 'shift_id' => $foreign->id, 'starts_on' => '2026-10-14'])->assertStatus(422);
    }

    public function test_cannot_roster_an_employee_of_another_company(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/shifts/assignments', ['employee_ids' => [$this->outsider->id], 'shift_id' => $this->day->id, 'starts_on' => '2026-10-14'])->assertForbidden();
        $this->assertSame(0, ShiftAssignment::count());
    }

    public function test_only_schedulers_can_read_the_roster_or_write_it(): void
    {
        Sanctum::actingAs($this->a->user);
        $this->getJson('/api/v1/shifts/schedule')->assertForbidden();
        $this->postJson('/api/v1/shifts/overrides', ['employee_ids' => [$this->a->id], 'dates' => ['2026-10-15'], 'day_off' => true])->assertForbidden();
        $this->postJson('/api/v1/shift-rotations', ['name' => 'X', 'slots' => [['shift_id' => $this->day->id]]])->assertForbidden();

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/v1/shifts/schedule?from=2026-10-14&to=2026-10-16')->assertOk()
            ->assertJsonPath('data.dates', ['2026-10-14', '2026-10-15', '2026-10-16'])
            ->assertJsonCount(2, 'data.employees');
    }

    public function test_roster_grid_shows_overrides_and_leave(): void
    {
        ShiftOverride::create(['company_id' => $this->company->id, 'employee_id' => $this->a->id, 'date' => '2026-10-15', 'shift_id' => $this->night->id]);
        Leave::create(['employee_id' => $this->b->id, 'type' => 'annual', 'from_date' => '2026-10-16', 'to_date' => '2026-10-16', 'status' => 'approved']);

        Sanctum::actingAs($this->admin);
        $rows = collect($this->getJson('/api/v1/shifts/schedule?from=2026-10-14&to=2026-10-16')->assertOk()->json('data.employees'))->keyBy('id');

        $this->assertSame('Night', $rows[$this->a->id]['days']['2026-10-15']['name']);
        $this->assertSame('override', $rows[$this->a->id]['days']['2026-10-15']['source']);
        $this->assertTrue($rows[$this->b->id]['days']['2026-10-16']['on_leave']);
        $this->assertFalse($rows[$this->b->id]['days']['2026-10-15']['on_leave']);
    }

    public function test_my_schedule_is_available_to_every_employee(): void
    {
        Sanctum::actingAs($this->a->user);
        $this->getJson('/api/v1/my-schedule?from=2026-10-14&to=2026-10-15')->assertOk()
            ->assertJsonCount(1, 'data.employees')
            ->assertJsonPath('data.employees.0.id', $this->a->id);
    }

    // ── Overrides ──────────────────────────────────────────────────────────────

    public function test_override_api_sets_a_day_off_and_can_be_removed(): void
    {
        Sanctum::actingAs($this->admin);
        $response = $this->postJson('/api/v1/shifts/overrides', ['employee_ids' => [$this->a->id], 'dates' => ['2026-10-15'], 'day_off' => true, 'reason' => 'Family event'])->assertCreated();
        $this->assertSame(1, $response->json('data.saved'));
        $this->assertSame([null, false, 'override'], $this->on($this->a, '2026-10-15'));

        $id = ShiftOverride::first()->id;
        $this->deleteJson("/api/v1/shifts/overrides/{$id}")->assertOk();
        $this->assertSame(['Day', true, 'default'], $this->on($this->a, '2026-10-15'));
    }

    public function test_override_requires_a_shift_or_a_day_off_not_both(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/shifts/overrides', ['employee_ids' => [$this->a->id], 'dates' => ['2026-10-15']])->assertStatus(422);
        $this->postJson('/api/v1/shifts/overrides', ['employee_ids' => [$this->a->id], 'dates' => ['2026-10-15'], 'day_off' => true, 'shift_id' => $this->day->id])->assertStatus(422);
    }

    public function test_override_warns_about_too_little_rest_and_leave(): void
    {
        Leave::create(['employee_id' => $this->a->id, 'type' => 'annual', 'from_date' => '2026-10-15', 'to_date' => '2026-10-15', 'status' => 'approved']);

        Sanctum::actingAs($this->admin);
        $warnings = $this->postJson('/api/v1/shifts/overrides', ['employee_ids' => [$this->a->id], 'dates' => ['2026-10-15'], 'shift_id' => $this->night->id])
            ->assertCreated()->json('data.warnings');

        $this->assertTrue(collect($warnings)->contains(fn ($w) => str_contains($w, 'approved leave')));
        $this->assertTrue(collect($warnings)->contains(fn ($w) => str_contains($w, 'hours of rest')));
    }

    // ── Attendance snapshot ────────────────────────────────────────────────────

    public function test_attendance_keeps_the_shift_it_was_recorded_under(): void
    {
        $record = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-12', 'check_in' => '2026-10-12 09:30:00', 'status' => 'late']);

        $this->assertSame($this->day->id, $record->shift_id);
        $this->assertSame('Day', $record->shift_name);

        // Edit the shift itself and the employee's default: the past day is not re-judged.
        $this->day->update(['start_time' => '07:00:00', 'end_time' => '15:00:00', 'grace_minutes' => 90]);
        $this->a->update(['shift_id' => $this->evening->id]);

        $fresh = $record->fresh();
        $this->assertSame('Day', $fresh->shift_name);
        $this->assertSame('09:00', $fresh->shift_start_time);
        $this->assertSame('late', $fresh->status);
        $this->assertTrue($fresh->is_late_arrival);
    }

    public function test_shift_edit_reaches_today_and_later_but_past_only_when_asked(): void
    {
        $past = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-12', 'check_in' => '2026-10-12 09:30:00', 'check_out' => '2026-10-12 17:30:00', 'status' => 'late']);
        $today = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-14', 'check_in' => '2026-10-14 09:30:00', 'check_out' => '2026-10-14 17:30:00', 'status' => 'late']);

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/v1/shifts/{$this->day->id}", ['grace_minutes' => 60])->assertOk();
        $this->assertSame('late', $past->fresh()->status);
        $this->assertSame('present', $today->fresh()->status);

        $this->putJson("/api/v1/shifts/{$this->day->id}", ['grace_minutes' => 60, 'apply_from' => '2026-10-12'])->assertOk();
        $this->assertSame('present', $past->fresh()->status);
    }

    public function test_changing_an_employees_default_shift_moves_future_records_only(): void
    {
        $past = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-12', 'status' => 'leave']);
        $future = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-15', 'status' => 'leave']);

        $this->a->update(['shift_id' => $this->evening->id]);

        $this->assertSame('Day', $past->fresh()->shift_name);
        $this->assertSame('Evening', $future->fresh()->shift_name);
    }

    public function test_an_override_on_a_past_day_re_judges_that_day(): void
    {
        $record = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-12', 'check_in' => '2026-10-12 13:55:00', 'check_out' => '2026-10-12 22:00:00', 'status' => 'late']);
        $this->assertSame('late', $record->status);

        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/shifts/overrides', ['employee_ids' => [$this->a->id], 'dates' => ['2026-10-12'], 'shift_id' => $this->evening->id])->assertCreated();

        $fresh = $record->fresh();
        $this->assertSame('Evening', $fresh->shift_name);
        $this->assertSame('override', $fresh->shift_source);
        $this->assertSame('present', $fresh->status);
    }

    public function test_work_on_a_rotation_day_off_earns_no_overtime(): void
    {
        $rotation = $this->rotation([$this->day->id, null]);
        $this->roster($this->a, ['shift_rotation_id' => $rotation->id, 'rotation_anchor_date' => '2026-10-12', 'starts_on' => '2026-10-01']);

        // Oct 13 (Tuesday) is a rotation day off; staying until 19:00 is not overtime.
        $record = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-13', 'check_in' => '2026-10-13 09:00:00', 'check_out' => '2026-10-13 19:00:00', 'status' => 'present']);
        $this->assertTrue($record->is_scheduled_off);
        $this->assertSame(0.0, $record->overtime_hours);

        $worked = Attendance::create(['employee_id' => $this->a->id, 'date' => '2026-10-12', 'check_in' => '2026-10-12 09:00:00', 'check_out' => '2026-10-12 19:00:00', 'status' => 'present']);
        $this->assertSame(2.0, $worked->overtime_hours);
    }

    // ── Where the schedule is read ─────────────────────────────────────────────

    public function test_absence_marking_follows_the_roster(): void
    {
        $rotation = $this->rotation([$this->day->id, null]);
        $this->roster($this->a, ['shift_rotation_id' => $rotation->id, 'rotation_anchor_date' => '2026-10-12', 'starts_on' => '2026-10-11']);
        ShiftOverride::create(['company_id' => $this->company->id, 'employee_id' => $this->b->id, 'date' => '2026-10-12', 'shift_id' => null]);
        ShiftOverride::create(['company_id' => $this->company->id, 'employee_id' => $this->b->id, 'date' => '2026-10-10', 'shift_id' => $this->day->id]); // a Saturday
        $this->resolver()->flush();

        $service = app(AttendanceAbsenceService::class);
        $service->markDay(Carbon::parse('2026-10-12'), $this->company->id); // Monday: A works, B has the day off
        $service->markDay(Carbon::parse('2026-10-13'), $this->company->id); // Tuesday: A's rotation day off
        $service->markDay(Carbon::parse('2026-10-10'), $this->company->id); // Saturday: B was rostered to work

        $this->assertDatabaseHas('attendances', ['employee_id' => $this->a->id, 'status' => 'absent']);
        $this->assertSame(1, Attendance::where('employee_id', $this->a->id)->count());
        $this->assertSame('2026-10-12', Attendance::where('employee_id', $this->a->id)->first()->date->toDateString());
        // B: absent on the Saturday they were rostered to work and on the ordinary Tuesday, but not on the day off the 12th.
        $this->assertEqualsCanonicalizing(['2026-10-10', '2026-10-13'], Attendance::where('employee_id', $this->b->id)->get()->map(fn ($r) => $r->date->toDateString())->all());
    }

    public function test_leave_only_covers_scheduled_working_days(): void
    {
        $rotation = $this->rotation([$this->day->id, null]);
        $this->roster($this->a, ['shift_rotation_id' => $rotation->id, 'rotation_anchor_date' => '2026-10-12', 'starts_on' => '2026-10-01']);
        $leave = Leave::create(['employee_id' => $this->a->id, 'type' => 'annual', 'from_date' => '2026-10-12', 'to_date' => '2026-10-15', 'status' => 'approved']);

        $dates = app(LeaveAttendanceSync::class)->workingDates($leave, $this->a->fresh());

        $this->assertSame(['2026-10-12', '2026-10-14'], $dates);
    }

    public function test_payroll_scheduled_days_follow_the_rotation(): void
    {
        $rotation = $this->rotation([$this->day->id, null]);
        $this->roster($this->a, ['shift_rotation_id' => $rotation->id, 'rotation_anchor_date' => '2026-10-01', 'starts_on' => '2026-10-01']);
        Holiday::create(['company_id' => $this->company->id, 'name' => 'Fest', 'holiday_date' => '2026-10-03', 'is_optional' => false]);

        $summary = app(PayrollAttendanceService::class)->summarize($this->a->fresh(), 10, 2026);

        // 16 working slots in October (1st, 3rd, ... 31st), minus the holiday on the 3rd.
        $this->assertSame(15, $summary['scheduled_days']);
    }

    public function test_night_shift_from_a_roster_keeps_punches_on_one_record(): void
    {
        $this->roster($this->a, ['shift_id' => $this->night->id, 'starts_on' => '2026-10-12']);
        $device = BiometricDevice::create(['name' => 'Door', 'company_id' => $this->company->id, 'status' => 'online']);
        $sync = app(BiometricSyncService::class);

        $sync->applyPunchPublic($device, $this->a->id, ['device_user_id' => '1', 'timestamp' => Carbon::parse('2026-10-12 21:55:00'), 'type' => 'in']);
        $sync->applyPunchPublic($device, $this->a->id, ['device_user_id' => '1', 'timestamp' => Carbon::parse('2026-10-13 06:02:00'), 'type' => 'out']);

        $records = Attendance::where('employee_id', $this->a->id)->get();
        $this->assertCount(1, $records);
        $this->assertSame('2026-10-12', $records[0]->date->toDateString());
        $this->assertSame('Night', $records[0]->shift_name);
        $this->assertSame('2026-10-13 06:02:00', $records[0]->check_out->toDateTimeString());
        $this->assertSame('present', $records[0]->status);
    }

    // ── Rotations API ──────────────────────────────────────────────────────────

    public function test_rotation_crud_and_guards(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/shift-rotations', ['name' => 'All off', 'slots' => [['shift_id' => null], ['shift_id' => null]]])->assertStatus(422);

        $id = $this->postJson('/api/v1/shift-rotations', ['name' => '2 on 1 off', 'slots' => [['shift_id' => $this->day->id], ['shift_id' => $this->evening->id], ['shift_id' => null]]])
            ->assertCreated()->assertJsonPath('data.cycle_days', 3)->json('data.id');

        $this->postJson('/api/v1/shifts/assignments', ['employee_ids' => [$this->a->id], 'shift_rotation_id' => $id, 'starts_on' => '2026-10-14'])->assertCreated();
        $this->assertSame(['Day', true, 'rotation'], $this->on($this->a, '2026-10-14'));
        $this->assertSame(['Evening', true, 'rotation'], $this->on($this->a, '2026-10-15'));

        // Changing the pattern moves the people who follow it.
        $this->putJson("/api/v1/shift-rotations/{$id}", ['slots' => [['shift_id' => $this->night->id], ['shift_id' => null]]])->assertOk();
        $this->assertSame(['Night', true, 'rotation'], $this->on($this->a, '2026-10-14'));

        $this->deleteJson("/api/v1/shift-rotations/{$id}")->assertStatus(422);
        ShiftAssignment::query()->delete();
        $this->deleteJson("/api/v1/shift-rotations/{$id}")->assertOk();
    }

    public function test_cannot_use_another_companys_shift_in_a_rotation(): void
    {
        $foreign = $this->shift($this->other, 'Foreign', '08:00', '16:00');
        Sanctum::actingAs($this->admin);

        $this->postJson('/api/v1/shift-rotations', ['name' => 'Bad', 'slots' => [['shift_id' => $foreign->id]]])->assertStatus(422);
    }

    // ── Shift delete guard ─────────────────────────────────────────────────────

    public function test_a_shift_in_use_cannot_be_deleted_but_an_unused_one_can(): void
    {
        Sanctum::actingAs($this->admin);
        $this->deleteJson("/api/v1/shifts/{$this->day->id}")->assertStatus(422);
        $this->assertNotNull(Shift::find($this->day->id));

        $this->deleteJson("/api/v1/shifts/{$this->night->id}")->assertOk();
        $this->assertNull(Shift::find($this->night->id));
    }

    // ── Swaps ──────────────────────────────────────────────────────────────────

    private function evenings(Employee $employee): void
    {
        $this->roster($employee, ['shift_id' => $this->evening->id, 'starts_on' => '2026-10-01']);
    }

    public function test_swap_goes_through_colleague_then_approver_and_changes_both_schedules(): void
    {
        $this->evenings($this->b);

        Sanctum::actingAs($this->a->user);
        $id = $this->postJson('/api/v1/shift-swaps', ['counterpart_id' => $this->b->id, 'requester_date' => '2026-10-15', 'reason' => 'Appointment'])
            ->assertCreated()->assertJsonPath('data.status', 'pending_peer')->json('data.id');
        $this->assertSame(['Day', true, 'default'], $this->on($this->a, '2026-10-15')); // nothing changes yet

        // The requester cannot answer for the colleague, nor approve their own swap.
        $this->postJson("/api/v1/shift-swaps/{$id}/respond", ['accept' => true])->assertForbidden();

        Sanctum::actingAs($this->b->user);
        $this->postJson("/api/v1/shift-swaps/{$id}/respond", ['accept' => true])->assertOk()->assertJsonPath('data.status', 'pending_approval');
        $this->postJson("/api/v1/shift-swaps/{$id}/decide", ['approve' => true])->assertForbidden();

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/v1/shift-swaps/{$id}/decide", ['approve' => true])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertSame(['Evening', true, 'swap'], $this->on($this->a, '2026-10-15'));
        $this->assertSame(['Day', true, 'swap'], $this->on($this->b, '2026-10-15'));
        $this->assertSame(['Day', true, 'default'], $this->on($this->a, '2026-10-16'));

        // A swap day cannot be edited as a plain override; cancelling the swap puts everything back.
        $this->postJson('/api/v1/shifts/overrides', ['employee_ids' => [$this->a->id], 'dates' => ['2026-10-15'], 'day_off' => true])
            ->assertCreated()->assertJsonPath('data.saved', 0);
        $this->postJson("/api/v1/shift-swaps/{$id}/cancel")->assertOk();
        $this->assertSame(['Day', true, 'default'], $this->on($this->a, '2026-10-15'));
        $this->assertSame(['Evening', true, 'roster'], $this->on($this->b, '2026-10-15'));
        $this->assertSame(0, ShiftOverride::count());
    }

    public function test_a_declined_swap_changes_nothing(): void
    {
        $this->evenings($this->b);
        Sanctum::actingAs($this->a->user);
        $id = $this->postJson('/api/v1/shift-swaps', ['counterpart_id' => $this->b->id, 'requester_date' => '2026-10-15'])->assertCreated()->json('data.id');

        Sanctum::actingAs($this->b->user);
        $this->postJson("/api/v1/shift-swaps/{$id}/respond", ['accept' => false])->assertOk()->assertJsonPath('data.status', 'rejected');

        $this->assertSame(0, ShiftOverride::count());
    }

    public function test_cover_swap_on_different_days_needs_each_person_free_on_the_others_day(): void
    {
        // A works Thursday the 15th and is off Friday the 16th; B the other way round.
        ShiftOverride::create(['company_id' => $this->company->id, 'employee_id' => $this->a->id, 'date' => '2026-10-16', 'shift_id' => null]);
        ShiftOverride::create(['company_id' => $this->company->id, 'employee_id' => $this->b->id, 'date' => '2026-10-15', 'shift_id' => null]);

        Sanctum::actingAs($this->admin);
        $this->postJson('/api/v1/shift-swaps', ['requester_id' => $this->a->id, 'counterpart_id' => $this->b->id, 'requester_date' => '2026-10-15', 'counterpart_date' => '2026-10-16', 'auto_approve' => true])
            ->assertCreated();

        $this->assertSame([null, false, 'swap'], $this->on($this->a, '2026-10-15'));
        $this->assertSame(['Day', true, 'swap'], $this->on($this->b, '2026-10-15'));
        $this->assertSame([null, false, 'swap'], $this->on($this->b, '2026-10-16'));
        $this->assertSame(['Day', true, 'swap'], $this->on($this->a, '2026-10-16'));
    }

    public function test_swap_is_refused_for_the_same_shift_leave_the_past_or_a_stranger(): void
    {
        Sanctum::actingAs($this->a->user);
        // Both on the Day shift: nothing to swap.
        $this->postJson('/api/v1/shift-swaps', ['counterpart_id' => $this->b->id, 'requester_date' => '2026-10-15'])->assertStatus(422);

        $this->evenings($this->b);
        $this->postJson('/api/v1/shift-swaps', ['counterpart_id' => $this->b->id, 'requester_date' => '2026-10-13'])->assertStatus(422); // past
        $this->postJson('/api/v1/shift-swaps', ['counterpart_id' => $this->outsider->id, 'requester_date' => '2026-10-15'])->assertForbidden();
        $this->postJson('/api/v1/shift-swaps', ['counterpart_id' => $this->a->id, 'requester_date' => '2026-10-15'])->assertStatus(422);

        Leave::create(['employee_id' => $this->b->id, 'type' => 'annual', 'from_date' => '2026-10-15', 'to_date' => '2026-10-15', 'status' => 'approved']);
        $this->postJson('/api/v1/shift-swaps', ['counterpart_id' => $this->b->id, 'requester_date' => '2026-10-15'])->assertStatus(422);
    }

    public function test_line_manager_can_decide_a_swap_but_unrelated_staff_cannot(): void
    {
        $managerUser = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $this->company->id]);
        $manager = Employee::create([
            'user_id' => $managerUser->id, 'company_id' => $this->company->id, 'name' => 'Boss', 'email' => 'boss@example.com',
            'department_id' => $this->a->department_id, 'designation' => 'Manager', 'salary' => 2000, 'status' => 'active',
        ]);
        $this->a->update(['manager_id' => $manager->id]);
        $this->evenings($this->b);

        $swap = ShiftSwap::create([
            'company_id' => $this->company->id, 'requester_id' => $this->a->id, 'counterpart_id' => $this->b->id,
            'requester_date' => '2026-10-15', 'counterpart_date' => '2026-10-15', 'status' => ShiftSwap::PENDING_APPROVAL,
        ]);

        Sanctum::actingAs($this->employee($this->company, 'Nosy', null)->user);
        $this->postJson("/api/v1/shift-swaps/{$swap->id}/decide", ['approve' => true])->assertForbidden();

        Sanctum::actingAs($managerUser);
        $this->postJson("/api/v1/shift-swaps/{$swap->id}/decide", ['approve' => true])->assertOk();
        $this->assertSame(['Evening', true, 'swap'], $this->on($this->a, '2026-10-15'));
    }

    public function test_unsettled_swaps_expire_when_their_day_arrives(): void
    {
        $swap = ShiftSwap::create([
            'company_id' => $this->company->id, 'requester_id' => $this->a->id, 'counterpart_id' => $this->b->id,
            'requester_date' => '2026-10-13', 'counterpart_date' => '2026-10-13', 'status' => ShiftSwap::PENDING_PEER,
        ]);

        $this->artisan('shifts:expire-swaps')->assertSuccessful();

        $this->assertSame(ShiftSwap::CANCELLED, $swap->fresh()->status);
    }
}
