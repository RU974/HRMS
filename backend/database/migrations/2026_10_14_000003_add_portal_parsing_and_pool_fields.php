<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            // Candidate portal: only a hash of the access token is stored.
            $table->string('portal_token_hash', 64)->nullable()->unique();
            $table->timestamp('portal_token_expires_at')->nullable();

            // Resume parsing.
            $table->longText('resume_text')->nullable();
            $table->json('resume_parsed')->nullable();
            $table->json('skills')->nullable();
            $table->decimal('experience_years', 4, 1)->nullable();

            // Duplicate detection (digits only, last 10) and talent pool.
            $table->string('phone_normalized', 20)->nullable()->index();
            $table->string('talent_pool', 30)->nullable()->index();
            $table->text('talent_pool_note')->nullable();
            $table->timestamp('talent_pool_added_at')->nullable();
        });

        Schema::table('offers', function (Blueprint $table) {
            $table->string('responded_via', 20)->nullable();
            $table->string('response_name')->nullable();
            $table->string('response_ip', 45)->nullable();
        });

        DB::table('candidates')->whereNotNull('phone')->orderBy('id')->each(function ($candidate) {
            $digits = preg_replace('/\D+/', '', (string) $candidate->phone);

            if (strlen($digits) >= 7) {
                DB::table('candidates')->where('id', $candidate->id)->update(['phone_normalized' => substr($digits, -10)]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('offers', function (Blueprint $table) {
            $table->dropColumn(['responded_via', 'response_name', 'response_ip']);
        });

        Schema::table('candidates', function (Blueprint $table) {
            $table->dropUnique(['portal_token_hash']);
            $table->dropIndex(['phone_normalized']);
            $table->dropIndex(['talent_pool']);
            $table->dropColumn([
                'portal_token_hash', 'portal_token_expires_at', 'resume_text', 'resume_parsed', 'skills',
                'experience_years', 'phone_normalized', 'talent_pool', 'talent_pool_note', 'talent_pool_added_at',
            ]);
        });
    }
};
