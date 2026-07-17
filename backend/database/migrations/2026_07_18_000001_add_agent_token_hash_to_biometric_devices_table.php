<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('biometric_devices', function (Blueprint $table) {
            if (!Schema::hasColumn('biometric_devices', 'agent_token_hash')) {
                $table->string('agent_token_hash')->nullable()->after('company_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('biometric_devices', function (Blueprint $table) {
            if (Schema::hasColumn('biometric_devices', 'agent_token_hash')) {
                $table->dropColumn('agent_token_hash');
            }
        });
    }
};
