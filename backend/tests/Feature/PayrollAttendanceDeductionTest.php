<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\LeaveType;
use App\Models\Payroll;
use App\Models\Shift;
use App\Models\TaxBracket;
use App\Models\User;
use App\Services\PayrollCalculator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * June 2026 starts on a Monday: 22 Mon-Fri days. Base salary 22,000 makes a day worth 1,000.
 */
class PayrollAttendanceDeductionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $manager;
    private Employee $employee;

    protected function setUp(): void
    {
        parent::setUp();

        TaxBracket::query()->delete();

        $this->company = Company::create(['name' => 'Acme Co']);
        $this->grantLicense($this->company, ['payroll']);
        $this->manager = $this->createUserWithRole(User::ROLE_PAYROLL_MANAGER, ['company_id' => $this->company->id]);

        $shift = Shift::create([
            'company_id' => $this->company->id,
            'name' => 'Day',
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
            'working_days' => [1, 2, 3, 4, 5],
            'grace_minutes' => 0,
            'is_active' => true,
        ]);
        $this->employee = $this->makeEmployee(['shift_id' => $shift->id]);

        LeaveType::create(['company_id' => $this->company->id, 'name' => 'Annual', 'default_days' => 20, 'is_paid' => true, 'is_active' => true]);
        LeaveType::create(['company_id' => $this->company->id, 'name' => 'Unpaid', 'default_days' => 30, 'is_paid' => false, 'is_active' => true]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeEmployee(array $overrides = []): Employee
    {
        static $n = 0;
        $n++;
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id, 'email' => "att{$n}@acme.test"]);

        return Employee::create(array_merge([
            'user_id' => $user->id,
            'company_id' => $this->company->id,
            'name' => "Att {$n}",
            'email' => "att{$n}@acme.test",
            'department_id' => Department::firstOrCreate(['name' => 'Ops'])->id,
            'designation' => 'Staff',
            'salary' => 22000,
            'basic_salary' => 22000,
            'allowances' => 0,
            'status' => 'active',
        ], $overrides));
    }

    /** One row per Mon-Fri of the month, "present" with punches, except the given dates / statuses. */
    private function fillMonth(Employee $employee, int $month, int $year, array $overrides = [], array $skip = []): void
    {
        $day = Carbon::create($year, $month, 1);
        while ($day->month === $month) {
            $date = $day->toDateString();
            if ($day->isWeekday() && !in_array($date, $skip, true)) {
                $status = $overrides[$date] ?? 'present';
                $punched = !in_array($status, ['absent', 'leave'], true);
                Attendance::create([
                    'employee_id' => $employee->id,
                    'date' => $date,
                    'status' => $status,
                    'check_in' => $punched ? "{$date} 09:00:00" : null,
                    'check_out' => $punched ? "{$date} 17:00:00" : null,
                ]);
            }
            $day->addDay();
        }
    }

    private function calc(?Employee $employee = null, int $month = 6, int $year = 2026): array
    {
        return (new PayrollCalculator())->calculateForEmployee(($employee ?? $this->employee)->fresh(), $month, $year);
    }

    private function leave(string $type, string $from, string $to, bool $half = false, string $status = 'approved'): Leave
    {
        return Leave::create([
            'employee_id' => $this->employee->id,
            'type' => $type,
            'from_date' => $from,
            'to_date' => $to,
            'half_day' => $half,
            'status' => $status,
        ]);
    }

    public function test_full_attendance_costs_nothing(): void
    {
        $this->fillMonth($this->employee, 6, 2026);

        $c = $this->calc();

        $this->assertSame(0.0, $c['attendance_deduction']);
        $this->assertSame(0.0, $c['unpaid_days']);
        $this->assertSame(22, $c['attendance_summary']['scheduled_days']);
        $this->assertSame(22000.0, $c['net_salary']);
    }

    public function test_absent_days_reduce_pay_by_the_daily_rate(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'absent', '2026-06-03' => 'absent']);

        $c = $this->calc();

        $this->assertSame(2, $c['attendance_summary']['absent_days']);
        $this->assertSame(2000.0, $c['attendance_deduction']);
        $this->assertSame(2.0, $c['unpaid_days']);
        $this->assertSame(20000.0, $c['net_salary']);
    }

    public function test_a_working_day_with_no_row_counts_as_absent_when_attendance_is_tracked(): void
    {
        $this->fillMonth($this->employee, 6, 2026, [], ['2026-06-10']);

        $c = $this->calc();

        $this->assertSame(1, $c['attendance_summary']['absent_days']);
        $this->assertSame(1000.0, $c['attendance_deduction']);
    }

    public function test_no_attendance_data_at_all_is_not_treated_as_a_month_of_absences(): void
    {
        $c = $this->calc();

        $this->assertFalse($c['attendance_summary']['attendance_tracked']);
        $this->assertSame(0.0, $c['attendance_deduction']);
        $this->assertSame(22000.0, $c['net_salary']);
    }

    public function test_an_employee_without_rows_is_absent_when_the_company_tracks_attendance(): void
    {
        $colleague = $this->makeEmployee();
        $this->fillMonth($colleague, 6, 2026);

        $c = $this->calc();

        $this->assertTrue($c['attendance_summary']['attendance_tracked']);
        $this->assertSame(22, $c['attendance_summary']['absent_days']);
        $this->assertSame(22000.0, $c['attendance_deduction']);
        $this->assertSame(0.0, $c['net_salary']);
    }

    public function test_deduction_never_exceeds_base_salary(): void
    {
        $colleague = $this->makeEmployee();
        $this->fillMonth($colleague, 6, 2026);
        $this->employee->update(['allowances' => 500]);

        $c = $this->calc();

        $this->assertSame(22.0, $c['unpaid_days']);
        $this->assertSame(22000.0, $c['attendance_deduction']);
        $this->assertSame(500.0, $c['net_salary']); // allowances are not prorated
    }

    public function test_unpaid_leave_costs_pay_and_paid_leave_does_not(): void
    {
        // Rows as LeaveAttendanceSync writes them, plus the approved leaves themselves.
        $this->fillMonth($this->employee, 6, 2026, [
            '2026-06-01' => 'leave', '2026-06-02' => 'leave', '2026-06-03' => 'leave',
            '2026-06-08' => 'leave', '2026-06-09' => 'leave',
        ]);
        $this->leave('Unpaid', '2026-06-01', '2026-06-03');
        $this->leave('Annual', '2026-06-08', '2026-06-09');

        $c = $this->calc();

        $this->assertSame(3.0, $c['attendance_summary']['unpaid_leave_days']);
        $this->assertSame(2.0, $c['attendance_summary']['paid_leave_days']);
        $this->assertSame(3000.0, $c['attendance_deduction']);
    }

    public function test_unpaid_leave_is_found_even_without_attendance_rows_and_skips_weekends(): void
    {
        $colleague = $this->makeEmployee();
        $this->fillMonth($colleague, 6, 2026);
        // Fri 5th to Mon 8th covers a weekend: only two working days.
        $this->leave('Unpaid', '2026-06-05', '2026-06-08');
        $this->fillMonth($this->employee, 6, 2026, [], ['2026-06-05', '2026-06-08']);

        $c = $this->calc();

        $this->assertSame(2.0, $c['attendance_summary']['unpaid_leave_days']);
        $this->assertSame(0, $c['attendance_summary']['absent_days']);
        $this->assertSame(2000.0, $c['attendance_deduction']);
    }

    public function test_pending_and_rejected_leave_do_not_cover_a_day(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'absent']);
        $this->leave('Annual', '2026-06-02', '2026-06-02', false, 'pending');

        $c = $this->calc();

        $this->assertSame(1, $c['attendance_summary']['absent_days']);
        $this->assertSame(1000.0, $c['attendance_deduction']);
    }

    public function test_leave_type_name_match_is_case_insensitive_and_unknown_unpaid_names_are_unpaid(): void
    {
        $this->fillMonth($this->employee, 6, 2026, [], ['2026-06-01', '2026-06-02']);
        $this->leave('UNPAID', '2026-06-01', '2026-06-01');
        $this->leave('Leave Without Pay', '2026-06-02', '2026-06-02');

        $c = $this->calc();

        $this->assertSame(2.0, $c['attendance_summary']['unpaid_leave_days']);
    }

    public function test_working_on_an_approved_leave_day_is_paid_as_worked(): void
    {
        $this->fillMonth($this->employee, 6, 2026);
        $this->leave('Unpaid', '2026-06-02', '2026-06-02');

        $c = $this->calc();

        $this->assertSame(0.0, $c['unpaid_days']);
        $this->assertSame(0.0, $c['attendance_deduction']);
    }

    public function test_half_day_without_leave_costs_half_a_day(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-04' => 'half_day']);

        $c = $this->calc();

        $this->assertSame(1, $c['attendance_summary']['half_days']);
        $this->assertSame(500.0, $c['attendance_deduction']);
        $this->assertSame(0.5, $c['unpaid_days']);
    }

    public function test_half_day_leave_costs_half_only_when_unpaid(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-04' => 'half_day', '2026-06-05' => 'half_day']);
        $this->leave('Unpaid', '2026-06-04', '2026-06-04', true);
        $this->leave('Annual', '2026-06-05', '2026-06-05', true);

        $c = $this->calc();

        $this->assertSame(0, $c['attendance_summary']['half_days']); // covered by leave, not double counted
        $this->assertSame(0.5, $c['attendance_summary']['unpaid_leave_days']);
        $this->assertSame(0.5, $c['attendance_summary']['paid_leave_days']);
        $this->assertSame(500.0, $c['attendance_deduction']);
    }

    public function test_every_third_late_arrival_costs_a_day(): void
    {
        $overrides = [];
        foreach (['01', '02', '03', '04', '05', '08', '09'] as $d) {
            $overrides["2026-06-{$d}"] = 'late';
        }
        $this->fillMonth($this->employee, 6, 2026, $overrides);

        $c = $this->calc();

        $this->assertSame(7, $c['attendance_summary']['late_count']);
        $this->assertSame(2, $c['attendance_summary']['late_blocks']);
        $this->assertSame(2000.0, $c['attendance_deduction']);
    }

    public function test_fewer_lates_than_the_threshold_cost_nothing(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-01' => 'late', '2026-06-02' => 'late']);

        $this->assertSame(0.0, $this->calc()['attendance_deduction']);
    }

    public function test_company_holidays_are_neither_working_days_nor_absences(): void
    {
        Holiday::create(['company_id' => $this->company->id, 'name' => 'Founders', 'holiday_date' => '2026-06-10', 'is_optional' => false]);
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'absent'], ['2026-06-10']);

        $c = $this->calc();

        $this->assertSame(21, $c['attendance_summary']['scheduled_days']);
        $this->assertSame(1, $c["attendance_summary"]["absent_days"]);
        $this->assertSame(round(22000 / 21, 2), $c['attendance_deduction']);
    }

    public function test_optional_holidays_still_count_as_working_days(): void
    {
        Holiday::create(['company_id' => $this->company->id, 'name' => 'Optional', 'holiday_date' => '2026-06-10', 'is_optional' => true]);
        $this->fillMonth($this->employee, 6, 2026, [], ['2026-06-10']);

        $this->assertSame(1000.0, $this->calc()['attendance_deduction']);
    }

    public function test_days_before_the_joining_date_are_unpaid(): void
    {
        $this->employee->update(['joining_date' => '2026-06-16']);
        $this->fillMonth($this->employee, 6, 2026, [], array_map(
            fn ($d) => sprintf('2026-06-%02d', $d),
            range(1, 15)
        ));

        $c = $this->calc();

        $this->assertSame(11, $c['attendance_summary']['pre_joining_days']); // Mon 1 - Fri 12, then 15
        $this->assertSame(0, $c['attendance_summary']['absent_days']);
        $this->assertSame(11000.0, $c['attendance_deduction']);
    }

    public function test_days_that_are_not_over_yet_are_not_judged(): void
    {
        Carbon::setTestNow('2026-10-16 12:00:00'); // Friday
        // Oct 2026: 22 weekdays. Everything up to Thursday the 15th is present; today and later have no row.
        $day = Carbon::create(2026, 10, 1);
        while ($day->day <= 15) {
            if ($day->isWeekday()) {
                Attendance::create([
                    'employee_id' => $this->employee->id,
                    'date' => $day->toDateString(),
                    'status' => 'present',
                    'check_in' => $day->toDateString() . ' 09:00:00',
                    'check_out' => $day->toDateString() . ' 17:00:00',
                ]);
            }
            $day->addDay();
        }

        $c = $this->calc(null, 10, 2026);

        $this->assertSame(0, $c['attendance_summary']['absent_days']);
        $this->assertSame(0.0, $c['attendance_deduction']);
    }

    public function test_missing_punches_are_paid_but_reported(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'missing_check_out']);

        $c = $this->calc();

        $this->assertSame(1, $c['attendance_summary']['missing_punch_days']);
        $this->assertSame(0.0, $c['attendance_deduction']);
    }

    public function test_work_on_a_weekend_is_not_penalised_or_required(): void
    {
        $this->fillMonth($this->employee, 6, 2026);
        Attendance::create(['employee_id' => $this->employee->id, 'date' => '2026-06-06', 'status' => 'late', 'check_in' => '2026-06-06 12:00:00', 'check_out' => '2026-06-06 16:00:00']);

        $c = $this->calc();

        $this->assertSame(0, $c['attendance_summary']['late_count']);
        $this->assertSame(0.0, $c['attendance_deduction']);
    }

    public function test_attendance_deduction_lowers_the_taxable_amount(): void
    {
        TaxBracket::create(['company_id' => $this->company->id, 'name' => 'flat', 'min_income' => 0, 'max_income' => null, 'rate' => 10, 'sort_order' => 1]);
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'absent', '2026-06-03' => 'absent']);

        $c = $this->calc();

        $this->assertSame(2000.0, $c['tax']); // 10% of 20,000 earned, not of 22,000
        $this->assertSame(18000.0, $c['net_salary']);
    }

    public function test_company_policy_can_change_the_penalties_or_switch_them_off(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'absent']);
        Sanctum::actingAs($this->manager);

        $this->putJson('/api/v1/payroll/attendance-policy', ['absent_deduction_days' => 2])->assertOk()
            ->assertJsonPath('data.absent_deduction_days', 2);
        $this->assertSame(2000.0, $this->calc()['attendance_deduction']);

        $this->putJson('/api/v1/payroll/attendance-policy', ['enabled' => false])->assertOk();
        $c = $this->calc();
        $this->assertSame(0.0, $c['attendance_deduction']);
        $this->assertSame(22000.0, $c['net_salary']);

        $this->getJson('/api/v1/payroll/attendance-policy')->assertOk()
            ->assertJsonPath('data.enabled', false)
            ->assertJsonPath('data.absent_deduction_days', 2);
    }

    public function test_policy_validates_input_and_requires_manage_permission(): void
    {
        Sanctum::actingAs($this->manager);
        $this->putJson('/api/v1/payroll/attendance-policy', ['half_day_deduction_days' => 3])->assertStatus(422);
        $this->putJson('/api/v1/payroll/attendance-policy', ['lates_per_deduction' => -1])->assertStatus(422);

        Sanctum::actingAs($this->employee->user);
        $this->getJson('/api/v1/payroll/attendance-policy')->assertForbidden();
        $this->putJson('/api/v1/payroll/attendance-policy', ['enabled' => false])->assertForbidden();
    }

    public function test_one_companys_policy_does_not_leak_to_another(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'absent']);
        Sanctum::actingAs($this->manager);
        $this->putJson('/api/v1/payroll/attendance-policy', ['enabled' => false])->assertOk();

        $this->assertTrue(\App\Models\PayrollAttendancePolicy::settingsFor((string) $other->id)['enabled']);
        $this->assertFalse(\App\Models\PayrollAttendancePolicy::settingsFor((string) $this->company->id)['enabled']);
    }

    public function test_generate_stores_the_deduction_and_the_breakdown_and_net_reconciles(): void
    {
        $this->fillMonth($this->employee, 6, 2026, ['2026-06-02' => 'absent', '2026-06-03' => 'half_day']);
        Sanctum::actingAs($this->manager);

        $this->postJson('/api/v1/payroll/generate', ['month' => 6, 'year' => 2026])->assertStatus(202);

        $payroll = Payroll::where('employee_id', $this->employee->id)->firstOrFail();
        $this->assertSame(1500.0, (float) $payroll->attendance_deduction);
        $this->assertSame(1.5, (float) $payroll->unpaid_days);
        $this->assertSame(1, $payroll->attendance_summary['absent_days']);
        $this->assertSame(1, $payroll->attendance_summary['half_days']);
        $this->assertSame(20500.0, (float) $payroll->net_salary);
    }

    public function test_manual_record_and_edit_include_the_attendance_deduction_in_net(): void
    {
        Sanctum::actingAs($this->manager);

        $id = $this->postJson('/api/v1/payroll', [
            'employee_id' => $this->employee->id, 'month' => 5, 'year' => 2026,
            'base_salary' => 1000, 'attendance_deduction' => 100,
        ])->assertCreated()->assertJsonPath('data.net_salary', 900)->json('data.id');

        // Editing something else keeps the stored attendance deduction in the net.
        $this->putJson("/api/v1/payroll/{$id}", ['allowances' => 50])->assertOk()
            ->assertJsonPath('data.net_salary', 950);

        $this->putJson("/api/v1/payroll/{$id}", ['attendance_deduction' => 300])->assertOk()
            ->assertJsonPath('data.net_salary', 750);

        $this->putJson("/api/v1/payroll/{$id}", ['attendance_deduction' => null])->assertOk()
            ->assertJsonPath('data.net_salary', 1050);
    }
}
