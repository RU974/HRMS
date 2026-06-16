<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_steps', function (Blueprint $table) {
            if (!Schema::hasColumn('approval_steps', 'required_approvals')) {
                $table->unsignedInteger('required_approvals')->default(1);
            }
            if (!Schema::hasColumn('approval_steps', 'approval_mode')) {
                $table->string('approval_mode')->default('first_n'); // first_n, all
            }
            if (!Schema::hasColumn('approval_steps', 'escalation_hours')) {
                $table->unsignedInteger('escalation_hours')->nullable();
            }
        });

        Schema::table('workflows', function (Blueprint $table) {
            if (!Schema::hasColumn('workflows', 'escalation_hours')) {
                $table->unsignedInteger('escalation_hours')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('approval_steps', function (Blueprint $table) {
            $table->dropColumn(['required_approvals', 'approval_mode', 'escalation_hours']);
        });

        Schema::table('workflows', function (Blueprint $table) {
            $table->dropColumn('escalation_hours');
        });
    }
};
