<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * workflows.company_id and approvals.company_id were created as unsigned bigints, but
 * company ids are UUIDs, so no company-scoped workflow or approval could be stored on
 * a strict database such as MySQL. Convert both to uuid-sized strings.
 *
 * Any numeric value left in these columns could never have matched a company, so it is
 * cleared first (making those rows global/unscoped, which is how the seeded workflows
 * already behave).
 */
return new class extends Migration
{
    private array $tables = ['workflows', 'approvals'];

    public function up(): void
    {
        foreach ($this->tables as $tableName) {
            if (! Schema::hasColumn($tableName, 'company_id')) {
                continue;
            }

            DB::table($tableName)->whereNotNull('company_id')->update(['company_id' => null]);

            Schema::table($tableName, function (Blueprint $table) {
                $table->string('company_id', 36)->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $tableName) {
            if (! Schema::hasColumn($tableName, 'company_id')) {
                continue;
            }

            DB::table($tableName)->whereNotNull('company_id')->update(['company_id' => null]);

            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('company_id')->nullable()->change();
            });
        }
    }
};
