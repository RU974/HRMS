<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            if (! Schema::hasColumn('audit_logs', 'company_id')) {
                $table->unsignedBigInteger('company_id')->nullable()->after('module')->index();
            }
        });
    }

    public function down()
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            if (Schema::hasColumn('audit_logs', 'company_id')) {
                $table->dropColumn('company_id');
            }
        });
    }
};
