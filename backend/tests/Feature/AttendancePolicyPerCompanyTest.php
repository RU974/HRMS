<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use App\Services\AttendanceAbsenceService;
use App\Services\AttendanceStatusRecalculator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The attendance policy (late-after time, manual override) belongs to a company, and the
 * half-day status behaves like the other hand-picked statuses.
 */
class AttendancePolicyPerCompanyTest extends TestCase
{
    use RefreshDatabase;

    private Company $a;
    private Company $b;
    private Employee $empA;
    private Employee $empB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = Company::create(['name' => 'Alpha']);
        $this->b = Company::create(['name' => 'Beta']);
        $this->grantLicense($this->a, ['attendance']);
        $this->grantLicense($this->b, ['attendance']);

        // Global default, then Alpha saves a strict 09:00 and Beta a relaxed 10:30.
        // The base migration seeds the global default row; make sure it reads 09:15.
        AttendancePolicy::whereNull('company_id')->update(['late_after_time' => '09:15:00', 'allow_manual_status_override' => true]);
        $this->assertSame(1, AttendancePolicy::whereNull('company_id')->count());
        $alpha = new AttendancePolicy(['name' => 'Default', 'late_after_time' => '09:00:00', 'allow_manual_status_override' => true]);
        $alpha->company_id = $this->a->id;
        $alpha->save();
        $beta = new AttendancePolicy(['name' => 'Default', 'late_after_time' => '10:30:00', 'allow_manual_status_override' => true]);
        $beta->company_id = $this->b->id;
        $beta->save();

        $this->empA = $this->employee($this->a, 'Alice');
        $this->empB = $this->employee($this->b, 'Bob');
    }

    private function employee(Company $company, string $name): Employee
    {
        $department = Department::create(['name' => "Dept {$name}"]);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id]);

        return Employee::create([
            'company_id' => $company->id, 'user_id' => $user->id, 'name' => $name, 'email' => strtolower($name) . '@example.com',
            'department_id' => $department->id, 'designation' => 'Agent', 'salary' => 1000, 'status' => 'active',
        ]);
    }

    private function manager(Company $company): User
    {
        return $this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $company->id]);
    }

    // ---- policy per company ------------------------------------------------------------

    public function test_each_company_sees_and_edits_only_its_own_policy(): void
    {
        Sanctum::actingAs($this->manager($this->a));
        $this->getJson('/api/v1/attendance/policy')->assertOk()->assertJsonPath('data.late_after_time', '09:00:00');
        $this->putJson('/api/v1/attendance/policy', ['late_after_time' => '08:45', 'allow_manual_status_override' => false])->assertOk();

        $this->assertSame('08:45:00', AttendancePolicy::where('company_id', $this->a->id)->value('late_after_time'));
        $this->assertSame('10:30:00', AttendancePolicy::where('company_id', $this->b->id)->value('late_after_time'));
        $this->assertSame('09:15:00', AttendancePolicy::whereNull('company_id')->value('late_after_time'));

        Sanctum::actingAs($this->manager($this->b));
        $this->getJson('/api/v1/attendance/policy')->assertOk()->assertJsonPath('data.late_after_time', '10:30:00');
    }

    public function test_a_company_without_its_own_policy_inherits_the_default_and_creates_its_own_on_save(): void
    {
        $c = Company::create(['name' => 'Gamma']);
        $this->grantLicense($c, ['attendance']);

        Sanctum::actingAs($this->manager($c));
        $this->getJson('/api/v1/attendance/policy')->assertOk()->assertJsonPath('data.late_after_time', '09:15:00');
        $this->putJson('/api/v1/attendance/policy', ['late_after_time' => '11:00', 'allow_manual_status_override' => true])->assertOk();

        $this->assertSame('11:00:00', AttendancePolicy::where('company_id', $c->id)->value('late_after_time'));
        $this->assertSame('09:15:00', AttendancePolicy::whereNull('company_id')->value('late_after_time'));
        $this->assertSame(1, AttendancePolicy::where('company_id', $c->id)->count());
    }

    public function test_saving_twice_updates_the_same_row_and_is_read_back_immediately(): void
    {
        Sanctum::actingAs($this->manager($this->a));
        $this->putJson('/api/v1/attendance/policy', ['late_after_time' => '08:00', 'allow_manual_status_override' => true])->assertOk();
        $this->putJson('/api/v1/attendance/policy', ['late_after_time' => '08:30', 'allow_manual_status_override' => true])->assertOk();

        $this->assertSame(1, AttendancePolicy::where('company_id', $this->a->id)->count());
        $this->getJson('/api/v1/attendance/policy')->assertJsonPath('data.late_after_time', '08:30:00');
    }

    public function test_late_status_follows_the_employees_company_policy(): void
    {
        Sanctum::actingAs($this->manager($this->a));
        $this->postJson('/api/v1/attendance', ['employee_id' => $this->empA->id, 'date' => '2026-10-14', 'check_in' => '09:45'])
            ->assertCreated()->assertJsonPath('data.status', 'late');

        // Same arrival time at Beta (relaxed 10:30) is on time. A super admin-style actor
        // is not needed: the policy comes from the employee, not from who is logged in.
        $beta = $this->manager($this->b);
        Sanctum::actingAs($beta);
        $this->postJson('/api/v1/attendance', ['employee_id' => $this->empB->id, 'date' => '2026-10-14', 'check_in' => '09:45'])
            ->assertCreated()->assertJsonPath('data.status', 'present');
    }

    public function test_recalculation_uses_each_records_company_policy(): void
    {
        foreach ([$this->empA, $this->empB] as $employee) {
            Attendance::create(['employee_id' => $employee->id, 'date' => '2026-10-14', 'status' => 'present',
                'check_in' => '2026-10-14 09:45:00', 'check_out' => '2026-10-14 17:00:00']);
        }

        (new AttendanceStatusRecalculator())->recalculate(Carbon::parse('2026-10-01'));

        $this->assertSame('late', Attendance::where('employee_id', $this->empA->id)->value('status'));
        $this->assertSame('present', Attendance::where('employee_id', $this->empB->id)->value('status'));
    }

    public function test_global_default_applies_when_no_company_row_exists(): void
    {
        AttendancePolicy::where('company_id', $this->a->id)->delete();

        $this->assertSame('09:15:00', AttendancePolicy::forEmployee($this->empA)->late_after_time);
        $this->assertSame('10:30:00', AttendancePolicy::forEmployee($this->empB)->late_after_time);
    }

    public function test_migration_backfill_copies_the_global_policy_to_every_company(): void
    {
        AttendancePolicy::whereNotNull('company_id')->delete();
        $migration = require database_path('migrations/2026_10_22_000001_add_company_id_to_attendance_policies.php');
        // Column already exists in the test schema; run only the data step by re-applying down/up.
        $migration->down();
        $migration->up();

        foreach ([$this->a, $this->b] as $company) {
            $this->assertSame('09:15:00', AttendancePolicy::where('company_id', $company->id)->value('late_after_time'));
        }
        $this->assertSame(1, AttendancePolicy::whereNull('company_id')->count());
    }

    // ---- half day ----------------------------------------------------------------------

    public function test_half_day_can_be_recorded_and_survives_an_edit_of_the_times(): void
    {
        Sanctum::actingAs($this->manager($this->a));
        $id = $this->postJson('/api/v1/attendance', [
            'employee_id' => $this->empA->id, 'date' => '2026-10-14', 'check_in' => '09:00', 'check_out' => '13:00', 'status' => 'half_day',
        ])->assertCreated()->assertJsonPath('data.status', 'half_day')->json('data.id');

        $this->putJson("/api/v1/attendance/{$id}", ['check_out' => '13:30'])->assertOk()->assertJsonPath('data.status', 'half_day');
    }

    public function test_half_day_is_counted_in_stats_and_not_marked_absent(): void
    {
        Attendance::create(['employee_id' => $this->empA->id, 'date' => '2026-10-14', 'status' => 'half_day']);

        app(AttendanceAbsenceService::class)->markDay(Carbon::parse('2026-10-14'), $this->a->id);
        $this->assertSame('half_day', Attendance::where('employee_id', $this->empA->id)->value('status'));

        Sanctum::actingAs($this->manager($this->a));
        $this->getJson("/api/v1/attendance/monthly-stats/{$this->empA->id}/10/2026")->assertOk()->assertJsonPath('data.half_day', 1);
        $this->getJson('/api/v1/attendance/company-monthly-summary?month=10&year=2026')->assertOk()->assertJsonPath('data.half_day', 1);
        $this->getJson('/api/v1/attendance?status=half_day')->assertOk()->assertJsonPath('data.total', 1);
    }
}
