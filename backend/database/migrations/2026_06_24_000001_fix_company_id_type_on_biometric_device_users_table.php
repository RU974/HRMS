<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('biometric_device_users') && Schema::hasColumn('biometric_device_users', 'company_id')) {
            Schema::table('biometric_device_users', function (Blueprint $table) {
                $table->string('company_id')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('biometric_device_users') && Schema::hasColumn('biometric_device_users', 'company_id')) {
            Schema::table('biometric_device_users', function (Blueprint $table) {
                $table->unsignedBigInteger('company_id')->nullable()->change();
            });
        }
    }
};
