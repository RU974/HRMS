<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A repeating pattern of days (a slot per day; no shift = day off).
        Schema::create('shift_rotations', function (Blueprint $table) {
            $table->id();
            $table->char('company_id', 36)->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->string('name', 120);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['company_id', 'name']);
        });

        Schema::create('shift_rotation_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shift_rotation_id')->constrained('shift_rotations')->cascadeOnDelete();
            $table->unsignedSmallInteger('position');
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->restrictOnDelete();
            $table->timestamps();

            $table->unique(['shift_rotation_id', 'position']);
        });

        // Roster: from starts_on to ends_on (open ended when null) the employee follows a shift or a rotation.
        Schema::create('shift_assignments', function (Blueprint $table) {
            $table->id();
            $table->char('company_id', 36)->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->restrictOnDelete();
            $table->foreignId('shift_rotation_id')->nullable()->constrained('shift_rotations')->restrictOnDelete();
            // Date on which the rotation is at its first slot.
            $table->date('rotation_anchor_date')->nullable();
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->string('notes', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'starts_on', 'ends_on']);
        });

        // One employee, one date: a different shift (or a day off) than the roster says.
        Schema::create('shift_overrides', function (Blueprint $table) {
            $table->id();
            $table->char('company_id', 36)->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->date('date');
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->restrictOnDelete();
            $table->string('type', 20)->default('override'); // override | swap
            $table->unsignedBigInteger('shift_swap_id')->nullable()->index();
            $table->string('reason', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'date']);
            $table->index(['company_id', 'date']);
        });

        // Two people exchange their shifts of one date each (usually the same date).
        Schema::create('shift_swaps', function (Blueprint $table) {
            $table->id();
            $table->char('company_id', 36)->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->foreignId('requester_id')->constrained('employees')->cascadeOnDelete();
            $table->foreignId('counterpart_id')->constrained('employees')->cascadeOnDelete();
            $table->date('requester_date');   // the day the requester gives away
            $table->date('counterpart_date'); // the day the counterpart gives away
            $table->string('reason', 255)->nullable();
            // pending_peer -> pending_approval -> approved | rejected | cancelled
            $table->string('status', 24)->default('pending_peer')->index();
            $table->timestamp('peer_responded_at')->nullable();
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_notes', 255)->nullable();
            $table->timestamps();
        });

        // What the day looked like when the record was made, so later changes to a shift,
        // roster or the employee's default never re-judge a past day.
        Schema::table('attendances', function (Blueprint $table) {
            $table->unsignedBigInteger('shift_id')->nullable()->after('date')->index();
            $table->json('shift_snapshot')->nullable()->after('shift_id');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn(['shift_id', 'shift_snapshot']);
        });
        Schema::dropIfExists('shift_swaps');
        Schema::dropIfExists('shift_overrides');
        Schema::dropIfExists('shift_assignments');
        Schema::dropIfExists('shift_rotation_slots');
        Schema::dropIfExists('shift_rotations');
    }
};
