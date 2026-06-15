<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('licenses')) {
            return;
        }

        Schema::create('licenses', function (Blueprint $table) {
            $table->uuid('id')->primary();

            // Tenant scoping — one active license per company
            $table->string('company_id')->nullable()->index();

            // Key & product identity
            $table->string('license_key')->unique();
            $table->string('product')->default('HRMS');

            // Edition: Starter | Professional | Enterprise
            $table->string('edition')->default('Starter');

            // Licensee info
            $table->string('licensee_name');
            $table->string('licensee_email');

            // Seat limits (0 = unlimited)
            $table->unsignedInteger('max_employees')->default(25);
            $table->unsignedInteger('max_users')->default(5);

            // Lifecycle
            $table->enum('status', ['trial', 'active', 'expired', 'suspended'])->default('trial');
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('activated_at')->nullable();

            // Meta
            $table->string('issued_by')->nullable();
            $table->string('support_email')->nullable();

            // JSON array of enabled module slugs
            $table->json('features')->nullable();

            // Arbitrary metadata for future use
            $table->json('metadata')->nullable();

            $table->boolean('is_active')->default(true);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('licenses');
    }
};