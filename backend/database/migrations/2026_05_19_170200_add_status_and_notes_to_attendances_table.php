<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->enum('status', ['present', 'absent', 'leave', 'late'])->default('present')->after('date');
            $table->text('notes')->nullable()->after('status');
            $table->unique(['employee_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropUnique('attendances_employee_id_date_unique');
            $table->dropColumn(['status', 'notes']);
        });
    }
};
