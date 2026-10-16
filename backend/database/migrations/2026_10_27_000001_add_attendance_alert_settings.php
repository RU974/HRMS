<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('biometric_devices')) {
            Schema::table('biometric_devices', function (Blueprint $table) {
                // When HR was last told this device/agent stopped syncing; cleared once it recovers.
                if (! Schema::hasColumn('biometric_devices', 'stale_alerted_at')) {
                    $table->timestamp('stale_alerted_at')->nullable();
                }
                // Turn off for a device that is switched off on purpose or not in use.
                if (! Schema::hasColumn('biometric_devices', 'monitor_sync')) {
                    $table->boolean('monitor_sync')->default(true);
                }
            });
        }

        if (Schema::hasTable('attendance_policies')) {
            Schema::table('attendance_policies', function (Blueprint $table) {
                // Attendance alerts (absent, missing punch, repeated lates, silent devices). On by default.
                if (! Schema::hasColumn('attendance_policies', 'alerts_enabled')) {
                    $table->boolean('alerts_enabled')->default(true);
                }
                // Lates in a month before the employee and manager are warned (null = "N lates = 1 absent", else 3).
                if (! Schema::hasColumn('attendance_policies', 'late_alert_threshold')) {
                    $table->unsignedSmallInteger('late_alert_threshold')->nullable();
                }
                // Minutes of silence before a device is reported (null = 3 x its sync interval, at least 3 hours).
                if (! Schema::hasColumn('attendance_policies', 'device_stale_minutes')) {
                    $table->unsignedSmallInteger('device_stale_minutes')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'biometric_devices' => ['stale_alerted_at', 'monitor_sync'],
            'attendance_policies' => ['alerts_enabled', 'late_alert_threshold', 'device_stale_minutes'],
        ] as $table => $columns) {
            foreach ($columns as $column) {
                if (Schema::hasColumn($table, $column)) {
                    Schema::table($table, fn (Blueprint $t) => $t->dropColumn($column));
                }
            }
        }
    }
};
