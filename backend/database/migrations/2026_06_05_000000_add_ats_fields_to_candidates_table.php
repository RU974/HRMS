<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->json('offer_letter_data')->nullable()->after('notes');
            $table->json('onboarding_checklist')->nullable()->after('offer_letter_data');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropColumn(['offer_letter_data', 'onboarding_checklist']);
        });
    }
};
