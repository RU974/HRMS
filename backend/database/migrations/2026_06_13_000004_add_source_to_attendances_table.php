<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendances') && ! Schema::hasColumn('attendances', 'source')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->enum('source', ['biometric', 'manual', 'mobile', 'web'])->default('manual')->after('status');
            });
        }

        if (Schema::hasTable('attendances') && ! Schema::hasColumn('attendances', 'biometric_device_id')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->unsignedBigInteger('biometric_device_id')->nullable()->after('source')->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('attendances')) {
            Schema::table('attendances', function (Blueprint $table) {
                if (Schema::hasColumn('attendances', 'source')) {
                    $table->dropColumn('source');
                }
                if (Schema::hasColumn('attendances', 'biometric_device_id')) {
                    $table->dropColumn('biometric_device_id');
                }
            });
        }
    }
};