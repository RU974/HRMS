<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->enum('correction_status', ['pending', 'approved', 'rejected'])->nullable()->after('notes');
            $table->text('correction_request_notes')->nullable()->after('correction_status');
            $table->timestamp('correction_requested_at')->nullable()->after('correction_request_notes');
            $table->text('correction_response_notes')->nullable()->after('correction_requested_at');
            $table->timestamp('correction_reviewed_at')->nullable()->after('correction_response_notes');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn([
                'correction_status',
                'correction_request_notes',
                'correction_requested_at',
                'correction_response_notes',
                'correction_reviewed_at',
            ]);
        });
    }
};
