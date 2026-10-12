<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\Company;
use App\Services\Recruitment\CandidateCheckService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** The private questionnaire a referee opens from the emailed link. No account needed. */
class ReferenceFormController extends Controller
{
    public function __construct(private readonly CandidateCheckService $checks)
    {
    }

    public function show(string $token)
    {
        $check = $this->checks->resolveByToken($token);
        $candidate = Candidate::query()->withoutGlobalScopes()->with('jobOpening:id,title')->findOrFail($check->candidate_id);

        return $this->ok([
            'candidate_name' => $candidate->full_name,
            'job_title' => $candidate->jobOpening?->title,
            'company' => Company::query()->whereKey($candidate->company_id)->value('name'),
            'referee_name' => $check->contact_name,
            'already_submitted' => $check->response !== null,
            'questions' => CandidateCheckService::REFERENCE_QUESTIONS,
        ]);
    }

    public function submit(Request $request, string $token)
    {
        $check = $this->checks->resolveByToken($token);

        $answers = $request->input('answers', []);
        if (! is_array($answers)) {
            throw ValidationException::withMessages(['answers' => ['Send the answers as a list.']]);
        }

        $clean = [];
        $errors = [];

        foreach (CandidateCheckService::REFERENCE_QUESTIONS as $question) {
            $value = $answers[$question['key']] ?? null;
            $value = is_scalar($value) ? trim((string) $value) : '';

            if ($value === '') {
                if ($question['required']) {
                    $errors["answers.{$question['key']}"] = ['This question needs an answer.'];
                }
                continue;
            }

            if ($question['type'] === 'rating' && (! ctype_digit($value) || (int) $value < 1 || (int) $value > 5)) {
                $errors["answers.{$question['key']}"] = ['Choose a rating from 1 to 5.'];
                continue;
            }

            if ($question['type'] === 'yes_no' && ! in_array(strtolower($value), ['yes', 'no'], true)) {
                $errors["answers.{$question['key']}"] = ['Answer yes or no.'];
                continue;
            }

            $clean[$question['key']] = $question['type'] === 'rating' ? (int) $value : mb_substr($value, 0, 3000);
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $this->checks->recordReferenceResponse($check, $clean);

        return $this->ok(null, 'Thank you. Your reference has been sent to the hiring team.', 201);
    }
}
