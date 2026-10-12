<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_openings', function (Blueprint $table) {
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('approval_id')->nullable()->index();
            $table->text('approval_note')->nullable();
            $table->text('justification')->nullable();
            $table->timestamp('submitted_at')->nullable();
        });

        Schema::table('companies', function (Blueprint $table) {
            // Off for existing companies so nothing changes until an admin turns requisitions on.
            $table->boolean('requisition_approval_required')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn('requisition_approval_required');
        });

        Schema::table('job_openings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('requested_by');
            $table->dropColumn(['approval_id', 'approval_note', 'justification', 'submitted_at']);
        });
    }
};
