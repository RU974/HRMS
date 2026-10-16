<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceQueryCountTest extends TestCase
{
    use RefreshDatabase;

    private function queriesForList(int $rows): int
    {
        $company = Company::create(['name' => 'Perf Co ' . $rows]);
        $this->grantLicense($company, ['attendance']);
        AttendancePolicy::firstOrCreate(['name' => 'Default'], ['late_after_time' => '09:00:00', 'allow_manual_status_override' => true]);
        $department = Department::create(['name' => 'Sales ' . $rows]);
        $shift = Shift::create([
            'company_id' => $company->id, 'name' => 'Night', 'start_time' => '20:00:00', 'end_time' => '05:00:00',
            'continues_after_midnight' => true, 'grace_minutes' => 0, 'working_days' => [1, 2, 3, 4, 5], 'is_active' => true,
        ]);
        for ($i = 0; $i < $rows; $i++) {
            $employee = Employee::create([
                'company_id' => $company->id, 'user_id' => User::factory()->create(['company_id' => $company->id])->id,
                'name' => "Emp {$rows}-{$i}", 'email' => "e{$rows}-{$i}@example.com", 'department_id' => $department->id,
                'designation' => 'Agent', 'salary' => 1000, 'status' => 'active', 'shift_id' => $shift->id,
            ]);
            Attendance::create(['employee_id' => $employee->id, 'date' => '2026-10-14', 'status' => 'present',
                'check_in' => '2026-10-14 20:00:00', 'check_out' => '2026-10-15 05:00:00']);
        }

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_ATTENDANCE_MANAGER, ['company_id' => $company->id]));
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/v1/attendance?per_page=50')->assertOk()->assertJsonCount($rows, 'data.data');
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_attendance_list_query_count_does_not_grow_with_rows(): void
    {
        $small = $this->queriesForList(3);
        $large = $this->queriesForList(12);

        $this->assertLessThanOrEqual($small + 2, $large, "List took {$small} queries for 3 rows but {$large} for 12.");
    }
}
