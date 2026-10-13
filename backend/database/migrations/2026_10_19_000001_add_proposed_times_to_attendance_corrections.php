<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->time('correction_proposed_check_in')->nullable()->after('correction_request_notes');
            $table->time('correction_proposed_check_out')->nullable()->after('correction_proposed_check_in');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn(['correction_proposed_check_in', 'correction_proposed_check_out']);
        });
    }
};
