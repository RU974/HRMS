<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offers', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('salary', 12, 2);
            $table->string('currency', 10)->default('PKR');
            $table->date('start_date')->nullable();
            $table->date('expires_at')->nullable();
            $table->json('benefits')->nullable();
            $table->text('terms')->nullable();
            $table->text('additional_notes')->nullable();
            $table->string('status', 20)->default('draft');
            $table->unsignedBigInteger('approval_id')->nullable()->index();
            $table->text('approval_note')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->text('decline_reason')->nullable();
            $table->timestamps();

            $table->index(['candidate_id', 'status']);
        });

        $this->migrateLegacyOfferData();
    }

    /**
     * Candidates used to carry a single free-form offer_letter_data JSON blob. Keep that
     * history by turning every blob that has a numeric salary into a real offer row.
     */
    private function migrateLegacyOfferData(): void
    {
        if (! Schema::hasColumn('candidates', 'offer_letter_data')) {
            return;
        }

        DB::table('candidates')
            ->whereNotNull('offer_letter_data')
            ->whereIn('stage', ['offer', 'hired'])
            ->orderBy('id')
            ->each(function ($candidate) {
                $data = json_decode((string) $candidate->offer_letter_data, true);

                if (! is_array($data)) {
                    return;
                }

                $rawSalary = $data['salary'] ?? null;
                $salary = is_numeric($rawSalary)
                    ? (float) $rawSalary
                    : (float) preg_replace('/[^0-9.]/', '', (string) $rawSalary);

                if ($salary <= 0) {
                    return;
                }

                DB::table('offers')->insert([
                    'company_id' => $candidate->company_id,
                    'candidate_id' => $candidate->id,
                    'salary' => $salary,
                    'currency' => $data['currency'] ?? 'PKR',
                    'start_date' => $data['start_date'] ?? null,
                    'benefits' => json_encode($data['benefits'] ?? []),
                    'terms' => $data['terms'] ?? null,
                    'additional_notes' => $data['additional_notes'] ?? null,
                    'status' => $candidate->stage === 'hired' ? 'accepted' : 'draft',
                    'responded_at' => $candidate->stage === 'hired' ? now() : null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('offers');
    }
};
