<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Shift;
use App\Models\User;
use App\Services\AttendanceCalculator;
use App\Services\PayrollCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Overtime is automatic, capped at 4h a day, needs no approval, and is zero on a weekly off or holiday. */
class OvertimeRulesTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Employee $employee;
    private Shift $shift;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Alpha']);
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
    }

    private function record(string $date, string $out): Attendance
    {
        return Attendance::create([
            'employee_id' => $this->employee->id, 'date' => $date, 'status' => 'present',
            'check_in' => "$date 09:00:00", 'check_out' => "$date $out",
        ]);
    }

    public function test_overtime_is_automatic_past_the_shift_end(): void
    {
        // Wednesday
        $this->assertSame(2.0, $this->record('2026-10-14', '19:00:00')->overtime_hours);
    }

    public function test_overtime_is_capped_at_four_hours(): void
    {
        $this->assertSame(4.0, $this->record('2026-10-14', '23:30:00')->overtime_hours);
    }

    public function test_no_overtime_on_a_weekly_off(): void
    {
        // Saturday is outside the shift's working days
        $this->assertSame(0.0, $this->record('2026-10-17', '20:00:00')->overtime_hours);
    }

    public function test_no_overtime_on_a_company_holiday_but_optional_holidays_still_count(): void
    {
        Holiday::create(['company_id' => $this->company->id, 'name' => 'Founders day', 'holiday_date' => '2026-10-14', 'is_optional' => false]);
        Holiday::create(['company_id' => $this->company->id, 'name' => 'Optional', 'holiday_date' => '2026-10-15', 'is_optional' => true]);

        $this->assertSame(0.0, $this->record('2026-10-14', '20:00:00')->overtime_hours);
        $this->assertSame(3.0, $this->record('2026-10-15', '20:00:00')->overtime_hours);
    }

    public function test_another_companys_holiday_does_not_remove_overtime(): void
    {
        $other = Company::create(['name' => 'Beta']);
        Holiday::create(['company_id' => $other->id, 'name' => 'Beta day', 'holiday_date' => '2026-10-14', 'is_optional' => false]);

        $this->assertSame(3.0, $this->record('2026-10-14', '20:00:00')->overtime_hours);
    }

    public function test_payroll_overtime_skips_weekly_off_and_holiday_and_caps_each_day(): void
    {
        Holiday::create(['company_id' => $this->company->id, 'name' => 'Holiday', 'holiday_date' => '2026-10-13', 'is_optional' => false]);

        $this->record('2026-10-13', '20:00:00'); // holiday -> 0
        $this->record('2026-10-14', '23:30:00'); // capped -> 4
        $this->record('2026-10-17', '20:00:00'); // weekly off -> 0
        $this->record('2026-10-15', '18:00:00'); // 1

        $result = (new PayrollCalculator())->calculateForEmployee($this->employee, 10, 2026);

        $this->assertSame(5.0, (float) $result['overtime_hours']);
    }

    public function test_manual_payroll_create_and_edit_ignore_client_overtime(): void
    {
        $this->grantLicense($this->company, ['payroll']);
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_PAYROLL_MANAGER, ['company_id' => $this->company->id]));

        $this->record('2026-10-14', '23:30:00'); // capped -> 4h
        $this->record('2026-10-17', '20:00:00'); // weekly off -> 0h

        $payload = [
            'employee_id' => $this->employee->id, 'month' => 10, 'year' => 2026, 'base_salary' => 2200,
            'overtime_hours' => 50, 'overtime_pay' => 99999,
        ];
        $created = $this->postJson('/api/v1/payroll', $payload)->assertCreated();

        $hours = (float) $created->json('data.overtime_hours');
        $pay = (float) $created->json('data.overtime_pay');
        $this->assertSame(4.0, $hours);
        $this->assertLessThan(99999, $pay);
        $this->assertGreaterThan(0, $pay);
        // 2200 / (22 * 8) = 12.5/h x 1.5 x 4h
        $this->assertSame(75.0, $pay);

        $id = $created->json('data.id');
        $edited = $this->putJson("/api/v1/payroll/{$id}", ['overtime_hours' => 50, 'overtime_pay' => 99999, 'base_salary' => 4400])->assertOk();
        $this->assertSame(4.0, (float) $edited->json('data.overtime_hours'));
        $this->assertSame(150.0, (float) $edited->json('data.overtime_pay'));
    }

    public function test_there_is_no_overtime_approval_or_comp_off_endpoint(): void
    {
        $uris = collect(app('router')->getRoutes()->getRoutes())->map->uri()->implode(' ');

        $this->assertDoesNotMatchRegularExpression('/overtime|comp[-_]?off/i', $uris);
    }
}
