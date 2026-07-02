<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            // Tracks which notification thresholds have already fired for this
            // license. Keys are namespaced strings like "expiry_30", "trial_7".
            // Prevents duplicate emails when a cron runs more than once per day.
            $table->json('notified_thresholds')->nullable()->after('metadata');
        });
    }

    public function down(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->dropColumn('notified_thresholds');
        });
    }
};
