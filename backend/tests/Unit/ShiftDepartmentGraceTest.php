<?php

namespace Tests\Unit;

use App\Models\AttendancePolicy;
use App\Models\Employee;
use App\Models\Shift;
use App\Models\ShiftDepartmentGrace;
use App\Services\AttendanceCalculator;
use PHPUnit\Framework\TestCase;

class ShiftDepartmentGraceTest extends TestCase
{
    private function shift(): Shift
    {
        $shift = new Shift(['start_time' => '09:00:00', 'end_time' => '17:00:00', 'grace_minutes' => 10]);
        $shift->setRelation('departmentGraces', collect([
            new ShiftDepartmentGrace(['department_id' => 1, 'grace_minutes' => 0]),
            new ShiftDepartmentGrace(['department_id' => 2, 'grace_minutes' => 30]),
        ]));

        return $shift;
    }

    public function test_grace_resolves_per_department_with_default_fallback(): void
    {
        $shift = $this->shift();

        $this->assertSame(0, $shift->graceMinutesFor(1));
        $this->assertSame(30, $shift->graceMinutesFor(2));
        $this->assertSame(10, $shift->graceMinutesFor(3));
        $this->assertSame(10, $shift->graceMinutesFor(null));
    }

    public function test_late_status_follows_department_grace(): void
    {
        $calc   = new AttendanceCalculator();
        $policy = new AttendancePolicy(['late_after_time' => '09:00:00']);
        $shift  = $this->shift();

        foreach ([1 => 0, 2 => 30] as $dept => $grace) {
            $employee = new Employee(['department_id' => $dept]);
            $employee->setRelation('shift', $shift);
            $effective = $employee->effectiveShift();

            $this->assertSame($grace, $effective->grace_minutes);
            $this->assertSame('present', $calc->deriveStatusFromCheckIn($policy, $effective, '2026-10-07 09:' . sprintf('%02d', $grace) . ':00'));
            $this->assertSame('late', $calc->deriveStatusFromCheckIn($policy, $effective, '2026-10-07 09:' . sprintf('%02d', $grace + 1) . ':00'));
        }

        // Original shift is not mutated.
        $this->assertSame(10, $shift->grace_minutes);
    }
}
