<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('onboarding_status')->nullable()->after('notes');
            $table->date('onboarding_start_date')->nullable()->after('onboarding_status');
            $table->text('onboarding_notes')->nullable()->after('onboarding_start_date');
            $table->index('onboarding_status');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['onboarding_status']);
            $table->dropColumn(['onboarding_status', 'onboarding_start_date', 'onboarding_notes']);
        });
    }
};

