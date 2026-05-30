<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table): void {
            if (!Schema::hasColumn('roles', 'guard_name')) {
                $table->string('guard_name')->default('web')->after('name');
            }
        });

        Schema::table('permissions', function (Blueprint $table): void {
            if (!Schema::hasColumn('permissions', 'name')) {
                $table->string('name')->nullable()->after('id');
            }

            if (!Schema::hasColumn('permissions', 'guard_name')) {
                $table->string('guard_name')->default('web')->after('action');
            }
        });

        Schema::table('audit_logs', function (Blueprint $table): void {
            if (!Schema::hasColumn('audit_logs', 'action')) {
                $table->string('action')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('audit_logs', 'module')) {
                $table->string('module')->nullable()->after('action');
            }
            if (!Schema::hasColumn('audit_logs', 'description')) {
                $table->text('description')->nullable()->after('module');
            }
            if (!Schema::hasColumn('audit_logs', 'old_values')) {
                $table->json('old_values')->nullable()->after('description');
            }
            if (!Schema::hasColumn('audit_logs', 'new_values')) {
                $table->json('new_values')->nullable()->after('old_values');
            }
            if (!Schema::hasColumn('audit_logs', 'ip_address')) {
                $table->string('ip_address', 45)->nullable()->after('new_values');
            }
            if (!Schema::hasColumn('audit_logs', 'user_agent')) {
                $table->text('user_agent')->nullable()->after('ip_address');
            }
            if (!Schema::hasColumn('audit_logs', 'endpoint')) {
                $table->string('endpoint')->nullable()->after('user_agent');
            }
            if (!Schema::hasColumn('audit_logs', 'http_method')) {
                $table->string('http_method', 10)->nullable()->after('endpoint');
            }
            if (!Schema::hasColumn('audit_logs', 'status_code')) {
                $table->unsignedSmallInteger('status_code')->nullable()->after('http_method');
            }
        });

        Schema::create('model_has_roles', function (Blueprint $table): void {
            $table->uuid('role_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->timestamps();

            $table->primary(['role_id', 'model_id', 'model_type'], 'model_has_roles_primary');
            $table->index(['model_id', 'model_type'], 'model_has_roles_model_index');
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });

        Schema::create('role_has_permissions', function (Blueprint $table): void {
            $table->uuid('role_id');
            $table->uuid('permission_id');
            $table->timestamps();

            $table->primary(['role_id', 'permission_id'], 'role_has_permissions_primary');
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
        });

        Schema::create('model_has_permissions', function (Blueprint $table): void {
            $table->uuid('permission_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->timestamps();

            $table->primary(['permission_id', 'model_id', 'model_type'], 'model_has_permissions_primary');
            $table->index(['model_id', 'model_type'], 'model_has_permissions_model_index');
            $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
        });

        DB::table('permissions')
            ->orderBy('id')
            ->get()
            ->each(function (object $permission): void {
                $name = $permission->name ?: $permission->module . '.' . $permission->action;
                DB::table('permissions')
                    ->where('id', $permission->id)
                    ->update(['name' => $name, 'guard_name' => 'web']);
            });

        DB::table('roles')
            ->orderBy('id')
            ->get()
            ->each(function (object $role): void {
                DB::table('roles')
                    ->where('id', $role->id)
                    ->update(['guard_name' => 'web']);
            });

        if (Schema::hasTable('user_roles')) {
            DB::table('user_roles')->orderBy('user_id')->orderBy('role_id')->get()->each(function (object $row): void {
                DB::table('model_has_roles')->updateOrInsert([
                    'role_id' => $row->role_id,
                    'model_type' => 'App\\Models\\User',
                    'model_id' => $row->user_id,
                ], [
                    'created_at' => $row->created_at,
                    'updated_at' => $row->updated_at,
                ]);
            });
        }

        if (Schema::hasTable('role_permissions')) {
            DB::table('role_permissions')->orderBy('role_id')->orderBy('permission_id')->get()->each(function (object $row): void {
                DB::table('role_has_permissions')->updateOrInsert([
                    'role_id' => $row->role_id,
                    'permission_id' => $row->permission_id,
                ], [
                    'created_at' => $row->created_at,
                    'updated_at' => $row->updated_at,
                ]);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('model_has_permissions');
        Schema::dropIfExists('role_has_permissions');
        Schema::dropIfExists('model_has_roles');

        Schema::table('audit_logs', function (Blueprint $table): void {
            foreach (['action', 'module', 'description', 'old_values', 'new_values', 'ip_address', 'user_agent', 'endpoint', 'http_method'] as $column) {
                if (Schema::hasColumn('audit_logs', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('permissions', function (Blueprint $table): void {
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $table->dropColumn('guard_name');
            }
            if (Schema::hasColumn('permissions', 'name')) {
                $table->dropColumn('name');
            }
        });

        Schema::table('roles', function (Blueprint $table): void {
            if (Schema::hasColumn('roles', 'guard_name')) {
                $table->dropColumn('guard_name');
            }
        });
    }
};
