<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('approvals', function (Blueprint $table) {
            if (!Schema::hasColumn('approvals', 'approved_at')) {
                $table->timestamp('approved_at')->nullable();
            }
            if (!Schema::hasColumn('approvals', 'rejected_at')) {
                $table->timestamp('rejected_at')->nullable();
            }
            if (!Schema::hasColumn('approvals', 'escalated_at')) {
                $table->timestamp('escalated_at')->nullable();
            }
            if (!Schema::hasColumn('approvals', 'due_at')) {
                $table->timestamp('due_at')->nullable();
            }
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('audit_logs', 'approval_id')) {
                $table->unsignedBigInteger('approval_id')->nullable()->index();
            }
        });
    }

    public function down()
    {
        Schema::table('approvals', function (Blueprint $table) {
            $table->dropColumn(['approved_at', 'rejected_at', 'escalated_at', 'due_at']);
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn('approval_id');
        });
    }
};
