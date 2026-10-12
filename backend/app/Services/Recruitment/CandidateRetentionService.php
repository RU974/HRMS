<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Models\Company;
use App\Models\Interview;
use App\Models\InterviewRescheduleRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Erases the personal data of candidates who are no longer being considered, either on request
 * (a person asking to be forgotten, or a recruiter erasing a record) or automatically once a
 * company's retention period has passed. The row itself stays, stripped of everything that
 * identifies the person, so pipeline counts and hiring reports remain accurate.
 */
class CandidateRetentionService
{
    public function __construct(
        private readonly ResumeStorageService $resumes,
        private readonly TalentPoolService $pool,
    ) {
    }

    public function anonymize(Candidate $candidate): Candidate
    {
        if ($candidate->employee_id || $candidate->stage === 'hired') {
            throw ValidationException::withMessages(['candidate' => ['A hired candidate is an employee now. Their records are managed under employees.']]);
        }

        if ($candidate->anonymized_at) {
            return $candidate;
        }

        DB::transaction(function () use ($candidate) {
            $this->resumes->delete($candidate);

            CandidateDocument::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->get()
                ->each(function (CandidateDocument $document) {
                    if ($document->file_path) {
                        Storage::disk('local')->delete($document->file_path);
                    }
                });
            CandidateDocument::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->delete();

            foreach (['candidate_messages', 'candidate_notes', 'candidate_answers'] as $table) {
                DB::table($table)->where('candidate_id', $candidate->id)->delete();
            }

            // Checks stay for the audit trail, but what was said about or by the people involved goes.
            DB::table('candidate_checks')->where('candidate_id', $candidate->id)->update([
                'contact_name' => null,
                'contact_email' => null,
                'contact_phone' => null,
                'relationship' => null,
                'result_notes' => null,
                'response' => null,
                'response_token_hash' => null,
                'response_token_expires_at' => null,
                'document_id' => null,
            ]);

            InterviewRescheduleRequest::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->update(['note' => null, 'proposed_times' => null]);
            Interview::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->update(['feedback' => null]);
            DB::table('interview_scorecards')->whereIn('interview_id', Interview::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->select('id'))->update(['strengths' => null, 'concerns' => null]);
            DB::table('offers')->where('candidate_id', $candidate->id)->update(['signature_record' => null, 'response_ip' => null, 'response_name' => null, 'sign_code_hash' => null]);

            $candidate->forceFill([
                'full_name' => 'Former candidate #' . $candidate->id,
                'email' => 'erased-' . $candidate->id . '@erased.invalid',
                'phone' => null,
                'phone_normalized' => null,
                'notes' => null,
                'tags' => null,
                'rejection_reason' => null,
                'offer_letter_data' => null,
                'resume_parsed' => null,
                'merged_from' => null,
                'fit_breakdown' => null,
                'talent_pool' => null,
                'talent_pool_note' => null,
                'talent_pool_added_at' => null,
                'talent_pool_expires_at' => null,
                'portal_token_hash' => null,
                'portal_token_expires_at' => null,
                'knockout_failed' => false,
                'status' => 'inactive',
                'anonymized_at' => now(),
            ])->saveQuietly();
        });

        return $candidate->refresh();
    }

    /**
     * Apply every company's automatic retention rules.
     *
     * @return array{pool_expired: int, pool_warned: int, erased: int}
     */
    public function run(): array
    {
        $poolResult = $this->pool->applyExpiry();
        $erased = 0;

        Company::query()->whereNotNull('candidate_retention_months')->each(function (Company $company) use (&$erased) {
            $cutoff = now()->subMonths((int) $company->candidate_retention_months);

            // Closed applications only, and never anyone who is still on the talent pool.
            Candidate::query()->withoutGlobalScopes()
                ->where('company_id', $company->id)
                ->where('stage', 'rejected')
                ->whereNull('talent_pool')
                ->whereNull('anonymized_at')
                ->whereNull('employee_id')
                ->where('updated_at', '<', $cutoff)
                ->each(function (Candidate $candidate) use (&$erased) {
                    $this->anonymize($candidate);
                    $erased++;
                });
        });

        return ['pool_expired' => $poolResult['expired'], 'pool_warned' => $poolResult['warned'], 'erased' => $erased];
    }
}
