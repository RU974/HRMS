<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateAnswer;
use App\Models\JobOpening;
use App\Models\JobQuestion;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Screening questions on a job and their answers. A question may carry a knockout rule that describes the
 * answer that is *acceptable*; any other answer knocks the application out.
 */
class ScreeningQuestionService
{
    public const MAX_QUESTIONS = 25;

    public function forJob(int $jobId): Collection
    {
        return JobQuestion::query()->withoutGlobalScopes()->where('job_opening_id', $jobId)->orderBy('sort_order')->orderBy('id')->get();
    }

    /** What an applicant sees: never the knockout rule, so the "right" answer cannot be read off the form. */
    public function presentPublic(Collection $questions): array
    {
        return $questions->map(fn (JobQuestion $question) => [
            'id' => $question->id,
            'label' => $question->label,
            'help_text' => $question->help_text,
            'type' => $question->type,
            'options' => $question->options ?? [],
            'required' => (bool) $question->required,
        ])->values()->all();
    }

    /**
     * Replace the questions of a job.
     *
     * @param  array<int, array<string, mixed>>  $input
     */
    public function save(JobOpening $job, array $input): Collection
    {
        if (count($input) > self::MAX_QUESTIONS) {
            throw ValidationException::withMessages(['questions' => ['A job can have at most ' . self::MAX_QUESTIONS . ' screening questions.']]);
        }

        $rows = collect($input)->values()->map(fn (array $row, int $index) => $this->normalise($row, $index));

        return DB::transaction(function () use ($job, $rows) {
            $existing = $this->forJob($job->id)->keyBy('id');
            $kept = [];

            foreach ($rows as $row) {
                $id = $row['id'];
                unset($row['id']);

                if ($id !== null && ! $existing->has($id)) {
                    throw ValidationException::withMessages(['questions' => ['One of the questions does not belong to this job.']]);
                }

                $attributes = $row + ['company_id' => $job->company_id, 'job_opening_id' => $job->id];

                if ($id !== null) {
                    $existing[$id]->update($attributes);
                    $kept[] = $id;
                } else {
                    $kept[] = JobQuestion::query()->withoutGlobalScopes()->create($attributes)->id;
                }
            }

            JobQuestion::query()->withoutGlobalScopes()->where('job_opening_id', $job->id)->whereNotIn('id', $kept)->delete();

            return $this->forJob($job->id);
        });
    }

    private function normalise(array $row, int $index): array
    {
        $type = (string) ($row['type'] ?? '');
        $label = trim((string) ($row['label'] ?? ''));
        $field = "questions.{$index}";

        if ($label === '' || mb_strlen($label) > 300) {
            throw ValidationException::withMessages(["{$field}.label" => ['Every question needs wording of up to 300 characters.']]);
        }

        if (! in_array($type, JobQuestion::TYPES, true)) {
            throw ValidationException::withMessages(["{$field}.type" => ['Unknown question type.']]);
        }

        $options = null;
        if (in_array($type, ['single_choice', 'multi_choice'], true)) {
            $options = collect($row['options'] ?? [])->map(fn ($option) => trim((string) $option))->filter()->unique()->values()->all();

            if (count($options) < 2) {
                throw ValidationException::withMessages(["{$field}.options" => ['Choice questions need at least two options.']]);
            }
        }

        $knockout = $this->normaliseKnockout($row['knockout'] ?? null, $type, $options, $field);

        return [
            'id' => isset($row['id']) ? (int) $row['id'] : null,
            'label' => $label,
            'help_text' => filled($row['help_text'] ?? null) ? mb_substr(trim((string) $row['help_text']), 0, 300) : null,
            'type' => $type,
            'options' => $options,
            'required' => (bool) ($row['required'] ?? false) || $knockout !== null,
            'knockout' => $knockout,
            'sort_order' => $index,
        ];
    }

    private function normaliseKnockout(mixed $rule, string $type, ?array $options, string $field): ?array
    {
        if (! is_array($rule) || ! filled($rule['operator'] ?? null)) {
            return null;
        }

        $operator = (string) $rule['operator'];
        $value = $rule['value'] ?? null;

        $allowed = match ($type) {
            'yes_no' => ['eq'],
            'number' => ['gte', 'lte', 'eq', 'neq'],
            'date' => ['gte', 'lte'],
            'single_choice' => ['in', 'not_in'],
            'multi_choice' => ['in', 'not_in'],
            default => [],
        };

        if (! in_array($operator, $allowed, true)) {
            throw ValidationException::withMessages(["{$field}.knockout" => ['That rule cannot be used with this question type.']]);
        }

        if ($type === 'yes_no') {
            $value = in_array(strtolower((string) $value), ['yes', 'true', '1'], true) ? 'yes' : 'no';
        } elseif ($type === 'number') {
            if (! is_numeric($value)) {
                throw ValidationException::withMessages(["{$field}.knockout" => ['The rule needs a number.']]);
            }
            $value = $value + 0;
        } elseif ($type === 'date') {
            if (! is_string($value) || strtotime($value) === false) {
                throw ValidationException::withMessages(["{$field}.knockout" => ['The rule needs a date.']]);
            }
        } else {
            $value = collect((array) $value)->map(fn ($item) => trim((string) $item))->filter()->values()->all();

            if ($value === [] || array_diff($value, $options ?? []) !== []) {
                throw ValidationException::withMessages(["{$field}.knockout" => ['Pick the acceptable answers from the options.']]);
            }
        }

        return ['operator' => $operator, 'value' => $value];
    }

    /**
     * Check an applicant's raw answers against the job's questions.
     *
     * @param  array<string|int, mixed>  $raw  keyed by question id
     * @return array<int, array{question: JobQuestion, answer: mixed, knocked_out: bool}>
     */
    public function validate(Collection $questions, array $raw): array
    {
        $errors = [];
        $result = [];

        foreach ($questions as $question) {
            $value = $raw[$question->id] ?? $raw[(string) $question->id] ?? null;
            $key = "answers.{$question->id}";

            $answer = $this->coerce($question, $value, $error);

            if ($error) {
                $errors[$key] = [$error];
                continue;
            }

            if ($answer === null || $answer === [] || $answer === '') {
                if ($question->required) {
                    $errors[$key] = ['This question needs an answer.'];
                }
                continue;
            }

            $result[] = ['question' => $question, 'answer' => $answer, 'knocked_out' => $this->knocksOut($question, $answer)];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $result;
    }

    private function coerce(JobQuestion $question, mixed $value, ?string &$error = null): mixed
    {
        $error = null;

        if ($value === null || $value === '' || $value === []) {
            return null;
        }

        switch ($question->type) {
            case 'text':
                return is_scalar($value) ? mb_substr(trim((string) $value), 0, 255) : $this->fail($error, 'Enter a short text answer.');
            case 'textarea':
                return is_scalar($value) ? mb_substr(trim((string) $value), 0, 3000) : $this->fail($error, 'Enter a text answer.');
            case 'number':
                return is_numeric($value) ? $value + 0 : $this->fail($error, 'Enter a number.');
            case 'yes_no':
                $normal = strtolower((string) (is_bool($value) ? ($value ? 'yes' : 'no') : $value));

                return in_array($normal, ['yes', 'true', '1'], true) ? 'yes' : (in_array($normal, ['no', 'false', '0'], true) ? 'no' : $this->fail($error, 'Answer yes or no.'));
            case 'date':
                return is_string($value) && strtotime($value) !== false ? date('Y-m-d', strtotime($value)) : $this->fail($error, 'Enter a valid date.');
            case 'single_choice':
                return is_string($value) && in_array($value, $question->options ?? [], true) ? $value : $this->fail($error, 'Choose one of the options.');
            case 'multi_choice':
                $picked = array_values(array_unique(array_map('strval', (array) $value)));

                return array_diff($picked, $question->options ?? []) === [] ? $picked : $this->fail($error, 'Choose from the listed options.');
        }

        return $this->fail($error, 'Unsupported question.');
    }

    private function fail(?string &$error, string $message): null
    {
        $error = $message;

        return null;
    }

    /** True when the answer does not meet the knockout rule. */
    public function knocksOut(JobQuestion $question, mixed $answer): bool
    {
        $rule = $question->knockout;

        if (! is_array($rule) || ! filled($rule['operator'] ?? null)) {
            return false;
        }

        $expected = $rule['value'] ?? null;

        $acceptable = match ($rule['operator']) {
            'eq' => is_numeric($answer) ? (float) $answer === (float) $expected : mb_strtolower((string) $answer) === mb_strtolower((string) $expected),
            'neq' => is_numeric($answer) ? (float) $answer !== (float) $expected : mb_strtolower((string) $answer) !== mb_strtolower((string) $expected),
            'gte' => is_numeric($answer) ? (float) $answer >= (float) $expected : (string) $answer >= (string) $expected,
            'lte' => is_numeric($answer) ? (float) $answer <= (float) $expected : (string) $answer <= (string) $expected,
            'in' => array_intersect((array) $answer, (array) $expected) !== [],
            'not_in' => array_intersect((array) $answer, (array) $expected) === [],
            default => true,
        };

        return ! $acceptable;
    }

    /**
     * Store the answers of a candidate. When any answer trips a knockout rule the candidate is flagged and,
     * if the job is set to auto-reject, moved to Rejected with the question named as the reason.
     *
     * @param  array<int, array{question: JobQuestion, answer: mixed, knocked_out: bool}>  $validated
     * @return array{knocked_out: bool, rejected: bool, reasons: array<int, string>}
     */
    public function record(Candidate $candidate, JobOpening $job, array $validated): array
    {
        $reasons = [];

        foreach ($validated as $item) {
            /** @var JobQuestion $question */
            $question = $item['question'];

            CandidateAnswer::query()->withoutGlobalScopes()->create([
                'company_id' => $candidate->company_id,
                'candidate_id' => $candidate->id,
                'job_question_id' => $question->id,
                'question' => $question->label,
                'type' => $question->type,
                'answer' => is_array($item['answer']) ? $item['answer'] : [$item['answer']],
                'knocked_out' => $item['knocked_out'],
            ]);

            if ($item['knocked_out']) {
                $reasons[] = $question->label;
            }
        }

        if ($reasons === []) {
            return ['knocked_out' => false, 'rejected' => false, 'reasons' => []];
        }

        $candidate->update(['knockout_failed' => true]);

        $rejected = false;
        if ($job->auto_reject_knockouts) {
            app(CandidateWorkflowService::class)->changeStage(
                $candidate,
                'rejected',
                null,
                'Did not meet a screening requirement: ' . implode('; ', $reasons)
            );
            $rejected = true;
        }

        return ['knocked_out' => true, 'rejected' => $rejected, 'reasons' => $reasons];
    }
}
