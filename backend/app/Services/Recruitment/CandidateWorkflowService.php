<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use Illuminate\Support\Arr;

class CandidateWorkflowService
{
    public const STAGES = [
        'applied',
        'screening',
        'interview',
        'offer',
        'hired',
        'rejected',
    ];

    public const STAGE_TRANSITIONS = [
        'applied' => ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'],
        'screening' => ['screening', 'interview', 'offer', 'hired', 'rejected'],
        'interview' => ['interview', 'offer', 'hired', 'rejected'],
        'offer' => ['offer', 'hired', 'rejected'],
        'hired' => ['hired'],
        'rejected' => ['rejected'],
    ];

    public function assertValidStage(string $stage): void
    {
        if (! in_array($stage, self::STAGES, true)) {
            abort(422, 'Invalid recruitment stage.');
        }
    }

    public function assertValidTransition(string $currentStage, string $targetStage): void
    {
        $this->assertValidStage($currentStage);
        $this->assertValidStage($targetStage);

        if (! in_array($targetStage, self::STAGE_TRANSITIONS[$currentStage] ?? [], true)) {
            abort(422, sprintf('Invalid candidate stage transition from "%s" to "%s".', $currentStage, $targetStage));
        }
    }

    public function normalizeChecklist(array $checklist): array
    {
        return collect($checklist)
            ->map(function ($item) {
                return [
                    'title' => trim((string) Arr::get($item, 'title', '')),
                    'completed' => filter_var(Arr::get($item, 'completed', false), FILTER_VALIDATE_BOOLEAN),
                    'notes' => isset($item['notes']) ? trim((string) $item['notes']) : null,
                ];
            })
            ->filter(fn ($item) => filled($item['title']))
            ->values()
            ->all();
    }

    public function normalizeOfferLetterData(array $offerLetterData): array
    {
        return [
            'offer_date' => $offerLetterData['offer_date'] ?? null,
            'start_date' => $offerLetterData['start_date'] ?? null,
            'salary' => $offerLetterData['salary'] ?? null,
            'currency' => $offerLetterData['currency'] ?? null,
            'benefits' => $offerLetterData['benefits'] ?? [],
            'terms' => $offerLetterData['terms'] ?? null,
            'additional_notes' => $offerLetterData['additional_notes'] ?? null,
        ];
    }

    public function prepareOfferLetter(Candidate $candidate, array $data = []): array
    {
        $baseData = $candidate->offer_letter_data ?? [];

        return array_merge([
            'candidate_name' => $candidate->full_name,
            'job_title' => $candidate->jobOpening?->title,
            'offer_date' => $baseData['offer_date'] ?? now()->toDateString(),
            'start_date' => $baseData['start_date'] ?? null,
            'salary' => $baseData['salary'] ?? null,
            'currency' => $baseData['currency'] ?? null,
            'employment_type' => $candidate->jobOpening?->employment_type,
            'benefits' => $baseData['benefits'] ?? [],
            'terms' => $baseData['terms'] ?? null,
            'additional_notes' => $baseData['additional_notes'] ?? null,
        ], $data);
    }
}
