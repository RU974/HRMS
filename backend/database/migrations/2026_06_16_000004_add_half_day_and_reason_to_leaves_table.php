<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leaves', function (Blueprint $table): void {
            $table->boolean('half_day')->default(false)->after('to_date');
            $table->text('reason')->nullable()->after('half_day'); // rejection/approval reason
        });
    }

    public function down(): void
    {
        Schema::table('leaves', function (Blueprint $table): void {
            $table->dropColumn(['half_day', 'reason']);
        });
    }
};
