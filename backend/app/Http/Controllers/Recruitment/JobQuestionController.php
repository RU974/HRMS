<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\JobOpening;
use App\Models\JobQuestion;
use App\Services\Recruitment\ScreeningQuestionService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Screening and knockout questions of a job opening. */
class JobQuestionController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly ScreeningQuestionService $questions)
    {
    }

    private function present(JobOpening $job): array
    {
        return [
            'questions' => $this->questions->forJob($job->id)->values(),
            'auto_reject_knockouts' => (bool) $job->auto_reject_knockouts,
            'types' => JobQuestion::TYPES,
        ];
    }

    public function show(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok($this->present($this->resolveTenantModel(JobOpening::class, $id)));
    }

    public function save(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $job = $this->resolveTenantModel(JobOpening::class, $id);

        $validated = $request->validate([
            'questions' => 'present|array|max:' . ScreeningQuestionService::MAX_QUESTIONS,
            'questions.*.id' => 'nullable|integer',
            'questions.*.label' => 'required|string|max:300',
            'questions.*.help_text' => 'nullable|string|max:300',
            'questions.*.type' => ['required', Rule::in(JobQuestion::TYPES)],
            'questions.*.options' => 'nullable|array|max:20',
            'questions.*.options.*' => 'string|max:120',
            'questions.*.required' => 'sometimes|boolean',
            'questions.*.knockout' => 'nullable|array',
            'questions.*.knockout.operator' => ['nullable', Rule::in(JobQuestion::OPERATORS)],
            'questions.*.knockout.value' => 'nullable',
            'auto_reject_knockouts' => 'sometimes|boolean',
        ]);

        $this->questions->save($job, $validated['questions']);

        if (array_key_exists('auto_reject_knockouts', $validated)) {
            $job->update(['auto_reject_knockouts' => $validated['auto_reject_knockouts']]);
        }

        return $this->ok($this->present($job->fresh()), 'Screening questions saved');
    }
}
