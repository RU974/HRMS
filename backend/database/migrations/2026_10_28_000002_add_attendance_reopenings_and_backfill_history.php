<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Same list as Attendance::TRACKED_FIELDS, frozen here so the migration never changes with the model. */
    private const TRACKED = [
        'employee_id', 'leave_id', 'date', 'check_in', 'check_out', 'shift_id', 'status', 'status_reason',
        'source', 'biometric_device_id', 'work_from_home', 'notes', 'correction_status',
        'correction_request_notes', 'correction_proposed_check_in', 'correction_proposed_check_out',
        'correction_response_notes',
    ];

    public function up(): void
    {
        // A closed month (payroll already run) can be reopened for a short, reasoned, audited window,
        // for one employee or for everyone. It never overrides an administrator's manual lock.
        if (! Schema::hasTable('attendance_period_reopenings')) {
            Schema::create('attendance_period_reopenings', function (Blueprint $table) {
                $table->id();
                $table->string('company_id')->index();
                $table->unsignedBigInteger('employee_id')->nullable(); // null = every employee of the company
                $table->unsignedSmallInteger('year');
                $table->unsignedTinyInteger('month');
                $table->string('reason', 500);
                $table->unsignedBigInteger('opened_by')->nullable();
                $table->timestamp('opened_at')->nullable();
                $table->dateTime('expires_at');
                $table->timestamp('closed_at')->nullable();
                $table->unsignedBigInteger('closed_by')->nullable();
                $table->timestamps();

                $table->index(['company_id', 'year', 'month']);
            });
        }

        // Punches the agent delivered for a month that is closed; they are not applied.
        if (Schema::hasTable('biometric_sync_logs') && ! Schema::hasColumn('biometric_sync_logs', 'records_locked')) {
            Schema::table('biometric_sync_logs', function (Blueprint $table) {
                $table->unsignedInteger('records_locked')->default(0);
            });
        }

        $this->backfillExistingRecords();
    }

    /**
     * Records that predate the change history get a baseline entry and an edited_at, so every record
     * has a starting point. The editor is unknown, so the source is "legacy" and edited_by stays empty.
     */
    private function backfillExistingRecords(): void
    {
        if (! Schema::hasTable('attendances') || ! Schema::hasTable('attendance_histories')
            || ! Schema::hasColumn('attendances', 'edited_source')) {
            return;
        }

        $companies = DB::table('employees')->pluck('company_id', 'id');

        DB::table('attendances')
            ->whereNull('edited_at')
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('attendance_histories')->whereColumn('attendance_histories.attendance_id', 'attendances.id'))
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($companies) {
                $history = [];
                foreach ($rows as $row) {
                    $stamp = $row->updated_at ?? $row->created_at ?? now();
                    $values = [];
                    foreach (self::TRACKED as $field) {
                        $value = $row->{$field} ?? null;
                        if ($value !== null) {
                            $values[$field] = [null, $field === 'date' ? substr((string) $value, 0, 10) : (string) $value];
                        }
                    }
                    $history[] = [
                        'company_id' => $companies[$row->employee_id] ?? null,
                        'attendance_id' => $row->id,
                        'employee_id' => $row->employee_id,
                        'date' => substr((string) $row->date, 0, 10),
                        'action' => 'created',
                        'changes' => json_encode($values),
                        'user_id' => null,
                        'source' => 'legacy',
                        'reason' => 'Baseline: the record existed before change history was introduced.',
                        'created_at' => $stamp,
                    ];
                }
                DB::table('attendance_histories')->insert($history);

                foreach ($rows as $row) {
                    DB::table('attendances')->where('id', $row->id)->update([
                        'edited_at' => $row->updated_at ?? $row->created_at ?? now(),
                        'edited_source' => 'legacy',
                    ]);
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasTable('attendance_histories')) {
            DB::table('attendance_histories')->where('source', 'legacy')->delete();
        }
        if (Schema::hasTable('attendances') && Schema::hasColumn('attendances', 'edited_source')) {
            DB::table('attendances')->where('edited_source', 'legacy')->update(['edited_at' => null, 'edited_source' => null]);
        }
        if (Schema::hasTable('biometric_sync_logs') && Schema::hasColumn('biometric_sync_logs', 'records_locked')) {
            Schema::table('biometric_sync_logs', fn (Blueprint $table) => $table->dropColumn('records_locked'));
        }
        Schema::dropIfExists('attendance_period_reopenings');
    }
};
