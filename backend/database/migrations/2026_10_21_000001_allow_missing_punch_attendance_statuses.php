<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // The status column was an enum(present, absent, leave, late). A plain string lets
    // it also hold missing_check_in / missing_check_out without driver-specific ALTERs.
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->string('status', 30)->default('present')->change();
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive: narrowing back to an enum would fail on rows
        // that already hold the missing_* statuses.
    }
};
