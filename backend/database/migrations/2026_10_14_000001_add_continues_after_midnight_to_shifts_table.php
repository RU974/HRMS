<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->boolean('continues_after_midnight')->default(false)->after('end_time');
        });

        // Existing shifts that already end at/before their start are night shifts.
        DB::table('shifts')->whereColumn('end_time', '<=', 'start_time')->update(['continues_after_midnight' => true]);
    }

    public function down(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->dropColumn('continues_after_midnight');
        });
    }
};
