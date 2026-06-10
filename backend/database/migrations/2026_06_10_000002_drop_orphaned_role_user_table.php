<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Drop the orphaned role_user table.
 *
 * Background
 * ----------
 * Two role-pivot tables were created during development:
 *
 *   1. model_has_roles  — morph pivot, used by HasRoles trait for ALL role assignments.
 *   2. role_user        — simple pivot, created by an earlier migration but never
 *                         written to by any application code (HasRoles always uses
 *                         model_has_roles). It was an empty dead table.
 *
 * Keeping both caused:
 *   • Role::assignedUsers() querying role_user and always returning empty results.
 *   • UserRole pivot model pointing at 'user_roles' (a third name that didn't exist),
 *     causing "table not found" errors on any code path that touched it.
 *
 * Fix
 * ---
 *   • This migration drops role_user.
 *   • Role::assignedUsers() has been removed from the Role model.
 *   • UserRole model has been redirected to model_has_roles.
 *
 * The down() method recreates the table so the migration is safely reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('role_user');
    }

    public function down(): void
    {
        if (! Schema::hasTable('role_user')) {
            Schema::create('role_user', function ($table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedBigInteger('role_id')->index();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();
                $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
                $table->unique(['user_id', 'role_id', 'company_id'], 'user_role_unique');
            });
        }
    }
};