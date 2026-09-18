<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TaxBracketController/tax_brackets table have existed for a while, but
 * TaxCalculator never actually read from them — it used a hardcoded array
 * in config/payroll.php instead, so every tax bracket an admin created was
 * silently ignored. Now that TaxCalculator reads from tax_brackets, seed
 * the table with the same values the config used to hardcode (as global,
 * company_id = null, rows) so tax calculations don't change on deploy.
 * Companies can still override with their own brackets via the existing UI.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('tax_brackets')->whereNull('company_id')->exists()) {
            return;
        }

        $now = now();
        $brackets = [
            ['name' => '0% bracket',  'min_income' => 0,      'max_income' => 50000,  'rate' => 0,  'sort_order' => 1],
            ['name' => '10% bracket', 'min_income' => 50000,  'max_income' => 100000, 'rate' => 10, 'sort_order' => 2],
            ['name' => '15% bracket', 'min_income' => 100000, 'max_income' => 200000, 'rate' => 15, 'sort_order' => 3],
            ['name' => '20% bracket', 'min_income' => 200000, 'max_income' => null,   'rate' => 20, 'sort_order' => 4],
        ];

        foreach ($brackets as &$bracket) {
            $bracket['company_id'] = null;
            $bracket['created_at'] = $now;
            $bracket['updated_at'] = $now;
        }

        DB::table('tax_brackets')->insert($brackets);
    }

    public function down(): void
    {
        DB::table('tax_brackets')->whereNull('company_id')->delete();
    }
};
