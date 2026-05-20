<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_policies', function (Blueprint $table) {
            $table->id();
            $table->string('name')->default('Default');
            $table->time('late_after_time')->default('09:15:00');
            $table->boolean('allow_manual_status_override')->default(true);
            $table->timestamps();
        });

        DB::table('attendance_policies')->insert([
            'name' => 'Default',
            'late_after_time' => '09:15:00',
            'allow_manual_status_override' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_policies');
    }
};
