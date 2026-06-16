<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_step_approvers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_step_id')->index();
            $table->string('approver_type');
            $table->string('approver_identifier')->nullable();
            $table->timestamps();

            $table->foreign('approval_step_id')->references('id')->on('approval_steps')->cascadeOnDelete();
        });

        // Backfill: every existing step's single approver becomes its first approver row.
        $steps = DB::table('approval_steps')->select('id', 'approver_type', 'approver_identifier')->get();
        $now = now();
        foreach ($steps as $step) {
            DB::table('approval_step_approvers')->insert([
                'approval_step_id' => $step->id,
                'approver_type' => $step->approver_type,
                'approver_identifier' => $step->approver_identifier,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_step_approvers');
    }
};
