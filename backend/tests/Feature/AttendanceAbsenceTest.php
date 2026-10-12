<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\Shift;
use App\Models\User;
use App\Services\AttendanceAbsenceService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceAbsenceTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private AttendanceAbsenceService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Acme HR']);
        $this->service = app(AttendanceAbsenceService::class);
    }

    private function employee(string $name, ?int $shiftId = null): Employee
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
            'shift_id' => $shiftId,
        ]);
    }

    private function monday(): Carbon { return Carbon::parse('2026-09-14'); }
    private function saturday(): Carbon { return Carbon::parse('2026-09-12'); }

    public function test_no_punch_and_no_leave_is_marked_absent(): void
    {
        $emp = $this->employee('Ali');

        $this->assertSame(1, $this->service->markDay($this->monday(), $this->company->id));
        $this->assertDatabaseHas('attendances', ['employee_id' => $emp->id, 'status' => 'absent']);
    }

    public function test_approved_leave_and_real_punches_are_left_alone(): void
    {
        $onLeave = $this->employee('Bea');
        $punched = $this->employee('Cy');
        Leave::create(['employee_id' => $onLeave->id, 'type' => 'annual', 'from_date' => '2026-09-14', 'to_date' => '2026-09-15', 'status' => 'approved']);
        Attendance::create(['employee_id' => $punched->id, 'date' => '2026-09-14', 'check_in' => '2026-09-14 09:00:00', 'status' => 'present']);

        $this->assertSame(0, $this->service->markDay($this->monday(), $this->company->id));
        $this->assertDatabaseMissing('attendances', ['employee_id' => $onLeave->id]);
        $this->assertDatabaseHas('attendances', ['employee_id' => $punched->id, 'status' => 'present']);
    }

    public function test_weekly_off_days_are_not_marked_unless_shift_works_them(): void
    {
        $default = $this->employee('Di');
        $this->assertSame(0, $this->service->markDay($this->saturday(), $this->company->id));
        $this->assertDatabaseMissing('attendances', ['employee_id' => $default->id]);

        $shift = Shift::create(['company_id' => $this->company->id, 'name' => 'Six day', 'start_time' => '09:00', 'end_time' => '17:00', 'working_days' => [1, 2, 3, 4, 5, 6]]);
        $sixDay = $this->employee('Eve', $shift->id);
        $this->service->markDay($this->saturday(), $this->company->id);
        $this->assertDatabaseHas('attendances', ['employee_id' => $sixDay->id, 'status' => 'absent']);
        $this->assertDatabaseMissing('attendances', ['employee_id' => $default->id]);
    }

    public function test_holidays_and_today_are_skipped(): void
    {
        $emp = $this->employee('Fay');
        Holiday::create(['company_id' => $this->company->id, 'name' => 'Day off', 'holiday_date' => '2026-09-14', 'is_optional' => false]);

        $this->assertSame(0, $this->service->markDay($this->monday(), $this->company->id));
        $this->assertSame(0, $this->service->markAbsences(now(), now(), $this->company->id));
        $this->assertDatabaseMissing('attendances', ['employee_id' => $emp->id]);
    }

    public function test_empty_existing_row_is_flipped_to_absent(): void
    {
        $emp = $this->employee('Gus');
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-14', 'status' => 'present']);

        $this->service->markDay($this->monday(), $this->company->id);
        $this->assertDatabaseHas('attendances', ['employee_id' => $emp->id, 'status' => 'absent']);
        $this->assertSame(1, Attendance::where('employee_id', $emp->id)->count());
    }
}
