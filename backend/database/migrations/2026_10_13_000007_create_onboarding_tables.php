<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('onboarding_templates', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('onboarding_template_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('onboarding_template_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('assignee_type', 20)->default('unassigned');
            $table->foreignId('assignee_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->smallInteger('due_offset_days')->default(0);
            $table->string('link_type', 20)->default('none');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('onboarding_tasks', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('due_date')->nullable();
            $table->string('status', 15)->default('pending');
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('link_type', 20)->default('none');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamp('reminded_at')->nullable();
            $table->timestamps();

            $table->index(['candidate_id', 'status']);
            $table->index(['assignee_id', 'status']);
        });

        $this->migrateLegacyChecklists();
    }

    /** Turn the old free-form JSON checklist on hired candidates into real tasks. */
    private function migrateLegacyChecklists(): void
    {
        if (! Schema::hasColumn('candidates', 'onboarding_checklist')) {
            return;
        }

        DB::table('candidates')
            ->whereNotNull('onboarding_checklist')
            ->orderBy('id')
            ->each(function ($candidate) {
                $items = json_decode((string) $candidate->onboarding_checklist, true);

                if (! is_array($items)) {
                    return;
                }

                foreach (array_values($items) as $index => $item) {
                    if (! is_array($item) || blank($item['title'] ?? null)) {
                        continue;
                    }

                    $done = filter_var($item['completed'] ?? false, FILTER_VALIDATE_BOOLEAN);

                    DB::table('onboarding_tasks')->insert([
                        'company_id' => $candidate->company_id,
                        'candidate_id' => $candidate->id,
                        'title' => mb_substr((string) $item['title'], 0, 255),
                        'description' => $item['notes'] ?? null,
                        'status' => $done ? 'completed' : 'pending',
                        'completed_at' => $done ? now() : null,
                        'sort_order' => $index,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('onboarding_tasks');
        Schema::dropIfExists('onboarding_template_tasks');
        Schema::dropIfExists('onboarding_templates');
    }
};
