<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // The policy used to be one global row shared by every company. Each company now owns
    // its row; the existing global row (company_id NULL) stays as the default for any
    // company that has not saved its own, and is copied to every current company so
    // nobody's late-after time changes when this runs.
    public function up(): void
    {
        Schema::table('attendance_policies', function (Blueprint $table) {
            $table->char('company_id', 36)->nullable()->after('id')->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
        });

        $global = DB::table('attendance_policies')->whereNull('company_id')->orderBy('id')->first();
        if (!$global) {
            return;
        }

        foreach (DB::table('companies')->pluck('id') as $companyId) {
            DB::table('attendance_policies')->insert([
                'company_id' => $companyId,
                'name' => $global->name,
                'late_after_time' => $global->late_after_time,
                'allow_manual_status_override' => $global->allow_manual_status_override,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('attendance_policies')->whereNotNull('company_id')->delete();

        Schema::table('attendance_policies', function (Blueprint $table) {
            $table->dropForeign(['company_id']);
            $table->dropIndex(['company_id']);
            $table->dropColumn('company_id');
        });
    }
};
