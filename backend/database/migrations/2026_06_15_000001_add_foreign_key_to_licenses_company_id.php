<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a proper foreign-key constraint on licenses.company_id → companies.id.
 *
 * The original create_licenses_table migration used string('company_id') with
 * only a plain index — no referential integrity. This migration retrofits the FK
 * so orphaned license records can no longer be created when a company is deleted.
 *
 * Cascade rule: nullOnDelete() — when a company is hard-deleted its licenses
 * are orphaned (company_id set to null) rather than deleted, preserving the
 * audit trail. Adjust to cascadeOnDelete() if you prefer hard-deleting licenses
 * along with their company.
 *
 * Safe to run on an existing database that already has data — the column type
 * (string / varchar 255) already matches companies.id (uuid / char 36 in MySQL,
 * varchar in some drivers). If your MySQL strict mode rejects the constraint
 * due to a charset mismatch on companies.id, run:
 *   ALTER TABLE companies MODIFY id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 * before running this migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guard: if licenses table doesn't exist (e.g. fresh install running all
        // migrations in order), the FK will be created by this migration only;
        // the create_licenses_table migration runs first and sets up the column.
        if (! Schema::hasTable('licenses') || ! Schema::hasTable('companies')) {
            return;
        }

        // Only add the FK if it doesn't already exist (idempotent).
        Schema::table('licenses', function (Blueprint $table) {
            $table->foreign('company_id')
                  ->references('id')
                  ->on('companies')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('licenses')) {
            return;
        }

        Schema::table('licenses', function (Blueprint $table) {
            $table->dropForeign(['company_id']);
        });
    }
};