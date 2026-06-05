<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_openings', function (Blueprint $table) {
            if (! Schema::hasColumn('job_openings', 'company_id')) {
                $table->uuid('company_id')->nullable()->after('id')->index();
                $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            }
        });

        Schema::table('candidates', function (Blueprint $table) {
            if (! Schema::hasColumn('candidates', 'company_id')) {
                $table->uuid('company_id')->nullable()->after('id')->index();
                $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            }
        });

        Schema::table('interviews', function (Blueprint $table) {
            if (! Schema::hasColumn('interviews', 'company_id')) {
                $table->uuid('company_id')->nullable()->after('id')->index();
                $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('interviews', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_id');
        });

        Schema::table('candidates', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_id');
        });

        Schema::table('job_openings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_id');
        });
    }
};
