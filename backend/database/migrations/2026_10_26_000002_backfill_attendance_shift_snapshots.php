<?php

use App\Models\Attendance;
use App\Models\Employee;
use App\Services\ShiftResolver;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Freeze today's view of every existing attendance record: the shift (with the department's grace)
     * the employee is on now. From here on, editing a shift or changing a default no longer re-judges
     * those days. Records of people who have since left the company, or without an employee, are skipped.
     */
    public function up(): void
    {
        $resolver = new ShiftResolver();

        Attendance::query()
            ->whereNull('shift_snapshot')
            ->select(['id', 'employee_id', 'date'])
            ->chunkById(500, function ($rows) use ($resolver) {
                $employees = Employee::withoutGlobalScopes()->whereIn('id', $rows->pluck('employee_id')->unique())->get()->keyBy('id');
                $resolver->preload($employees, $rows->min('date'), $rows->max('date'));

                foreach ($rows as $row) {
                    $employee = $employees->get($row->employee_id);
                    if (!$employee) {
                        continue;
                    }

                    $schedule = $resolver->on($employee, $row->date);
                    DB::table('attendances')->where('id', $row->id)->update([
                        'shift_id' => $schedule->shift?->id,
                        'shift_snapshot' => json_encode($schedule->toSnapshot()),
                    ]);
                }
            });
    }

    public function down(): void
    {
        // The snapshot columns are dropped by the migration that created them.
    }
};
