<?php

namespace Tests\Unit;

use App\Models\AttendancePolicy;
use App\Models\Shift;
use App\Services\AttendanceCalculator;
use PHPUnit\Framework\TestCase;

class NightShiftAttendanceTest extends TestCase
{
    public function test_checkout_before_checkin_rolls_to_next_day(): void
    {
        $calc = new AttendanceCalculator();
        $in = $calc->normalizeCheckTime('2026-10-06', '19:30');
        $out = $calc->resolveCheckOut('2026-10-06', $in, '05:10');

        $this->assertSame('2026-10-07 05:10:00', $out);
    }

    public function test_same_day_checkout_is_untouched(): void
    {
        $calc = new AttendanceCalculator();
        $out = $calc->resolveCheckOut('2026-10-06', '2026-10-06 09:00:00', '17:00');

        $this->assertSame('2026-10-06 17:00:00', $out);
    }

    public function test_after_midnight_checkin_is_late_against_previous_evening_start(): void
    {
        $calc = new AttendanceCalculator();
        $shift = new Shift(['start_time' => '20:00:00', 'end_time' => '05:00:00', 'grace_minutes' => 10]);
        $policy = new AttendancePolicy(['late_after_time' => '09:00:00']);

        $this->assertTrue($calc->isOvernightShift($shift));
        $this->assertSame('late', $calc->deriveStatusFromCheckIn($policy, $shift, '2026-10-07 00:30:00'));
        $this->assertSame('present', $calc->deriveStatusFromCheckIn($policy, $shift, '2026-10-06 19:45:00'));
    }
}
