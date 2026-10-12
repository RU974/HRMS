<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\Employee;
use App\Models\Interview;
use App\Models\InterviewScorecard;
use App\Models\Scopes\CompanyScope;
use App\Services\Recruitment\InterviewRescheduleService;
use App\Services\Recruitment\RecruitmentNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

abstract class AbstractInterviewController extends Controller
{
    use EnsuresCompanyIsolation;

    private const TYPES = 'screening,technical,behavioral,managerial,hr';

    private function validateCandidateBelongsToCompany(Request $request, string $field = 'candidate_id')
    {
        return Rule::exists('candidates', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
        });
    }

    private function validateInterviewerBelongsToCompany(Request $request)
    {
        return Rule::exists('employees', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
            $query->where('status', 'active');
        });
    }

    private function canViewAll(Request $request): bool
    {
        $user = $request->user();

        return (bool) $user && ($user->hasAnyRole([\App\Models\User::ROLE_SUPER_ADMIN]) || $user->hasPermission('recruitment:view'));
    }

    private function ownEmployeeIds(Request $request): array
    {
        return Employee::query()->where('user_id', $request->user()?->id)->pluck('id')->all();
    }

    /**
     * Interviewers without recruitment:view only ever see their own interviews, and only
     * the candidate details needed to run the interview.
     */
    private function presentForInterviewer(Interview $interview, int $userId): array
    {
        $own = $interview->scorecards->firstWhere('submitted_by', $userId);

        return [
            'id' => $interview->id,
            'candidate_id' => $interview->candidate_id,
            'candidate' => [
                'id' => $interview->candidate?->id,
                'full_name' => $interview->candidate?->full_name,
                'email' => $interview->candidate?->email,
                'job_title' => $interview->candidate?->jobOpening?->title,
            ],
            'interviewer_id' => $interview->interviewer_id,
            'interviewer_name' => $interview->interviewer_name,
            'interview_type' => $interview->interview_type,
            'scheduled_at' => $interview->scheduled_at,
            'duration_minutes' => $interview->duration_minutes,
            'location' => $interview->location,
            'meeting_link' => $interview->meeting_link,
            'status' => $interview->status,
            'result' => $interview->result,
            'my_scorecard' => $own,
        ];
    }

    private function assertNoConflicts(Carbon $start, int $duration, ?int $interviewerId, int $candidateId, ?int $ignoreId = null): void
    {
        $end = $start->copy()->addMinutes($duration);

        // Narrow with a generous window in SQL, then do the exact overlap test in PHP so
        // the logic behaves the same on every database.
        $nearby = Interview::query()
            ->where('status', 'scheduled')
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->whereBetween('scheduled_at', [$start->copy()->subHours(10), $end])
            ->where(function ($query) use ($interviewerId, $candidateId) {
                $query->where('candidate_id', $candidateId);
                if ($interviewerId) {
                    $query->orWhere('interviewer_id', $interviewerId);
                }
            })
            ->with(['candidate:id,full_name', 'interviewer:id,name'])
            ->get()
            ->filter(fn (Interview $other) => $other->scheduled_at < $end && $other->endsAt() > $start);

        foreach ($nearby as $other) {
            if ($interviewerId && (int) $other->interviewer_id === $interviewerId) {
                throw ValidationException::withMessages([
                    'scheduled_at' => [sprintf(
                        '%s is already booked from %s to %s (%s).',
                        $other->interviewer?->name ?? 'The interviewer',
                        $other->scheduled_at->format('H:i'),
                        $other->endsAt()->format('H:i'),
                        $other->candidate?->full_name ?? 'another interview'
                    )],
                ]);
            }

            if ((int) $other->candidate_id === $candidateId) {
                throw ValidationException::withMessages([
                    'scheduled_at' => [sprintf(
                        'This candidate already has an interview from %s to %s.',
                        $other->scheduled_at->format('H:i'),
                        $other->endsAt()->format('H:i')
                    )],
                ]);
            }
        }
    }

    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:view', 'recruitment:interview']);

        $viewAll = $this->canViewAll($request);
        $mine = ! $viewAll || $request->boolean('mine');

        $query = Interview::with($viewAll
            ? ['candidate.interviews', 'candidate.jobOpening:id,title', 'interviewer:id,name,user_id']
            : ['candidate.jobOpening:id,title', 'scorecards'])
            ->withCount(['rescheduleRequests as pending_reschedule_count' => fn ($requests) => $requests->where('status', 'pending')])
            ->orderBy('scheduled_at', 'desc');

        if ($mine) {
            $query->whereIn('interviewer_id', $this->ownEmployeeIds($request) ?: [0]);
        }

        foreach (['candidate_id', 'result', 'interviewer_id'] as $filter) {
            if ($viewAll && $request->filled($filter)) {
                $query->where($filter, $request->input($filter));
            }
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('from')) {
            $query->where('scheduled_at', '>=', Carbon::parse($request->input('from'))->startOfDay());
        }

        if ($request->filled('to')) {
            $query->where('scheduled_at', '<=', Carbon::parse($request->input('to'))->endOfDay());
        }

        if ($viewAll && $request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('interviewer_name', 'like', "%{$q}%")
                    ->orWhereHas('candidate', function ($candidateQuery) use ($q) {
                        $candidateQuery->where('full_name', 'like', "%{$q}%");
                    });
            });
        }

        $page = $query->paginate(min(max((int) $request->input('per_page', 15), 1), 100));

        if (! $viewAll) {
            $userId = $request->user()->id;
            $page->setCollection($page->getCollection()->map(fn (Interview $interview) => $this->presentForInterviewer($interview, $userId)));
        }

        return $this->ok($page);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:create');

        $validated = $request->validate([
            'candidate_id' => ['required', $this->validateCandidateBelongsToCompany($request)],
            'interviewer_id' => ['nullable', $this->validateInterviewerBelongsToCompany($request)],
            'interviewer_name' => 'required_without:interviewer_id|nullable|string|max:255',
            'interview_type' => 'nullable|in:' . self::TYPES,
            'scheduled_at' => 'required|date',
            'duration_minutes' => 'nullable|integer|min:15|max:480',
            'location' => 'nullable|string|max:255',
            'meeting_link' => 'nullable|url|max:500',
            'result' => 'nullable|in:pending,pass,fail,hold',
            'feedback' => 'nullable|string',
        ]);

        $candidate = Candidate::withoutGlobalScope(CompanyScope::class)->findOrFail($validated['candidate_id']);

        if (in_array($candidate->stage, ['hired', 'rejected'], true)) {
            throw ValidationException::withMessages(['candidate_id' => ['Interviews cannot be scheduled for hired or rejected candidates.']]);
        }

        $interviewer = ! empty($validated['interviewer_id']) ? Employee::find($validated['interviewer_id']) : null;
        $duration = (int) ($validated['duration_minutes'] ?? 60);
        $start = Carbon::parse($validated['scheduled_at']);

        $this->assertNoConflicts($start, $duration, $interviewer?->id, $candidate->id);

        $interview = Interview::create([
            ...$validated,
            'interviewer_name' => $interviewer?->name ?? $validated['interviewer_name'],
            'company_id' => $candidate->company_id ?? $request->user()?->company_id,
            'created_by' => $request->user()?->id,
            'duration_minutes' => $duration,
            'interview_type' => $validated['interview_type'] ?? 'technical',
            'result' => $validated['result'] ?? 'pending',
            'status' => 'scheduled',
        ]);

        app(RecruitmentNotificationService::class)->interviewScheduled($interview, $request->user()?->id);

        return $this->ok($interview->load(['candidate', 'interviewer:id,name,user_id']), 'Interview scheduled successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:view', 'recruitment:interview']);

        $interview = $this->resolveTenantModel(Interview::class, $id);

        if (! $this->canViewAll($request)) {
            abort_unless(in_array($interview->interviewer_id, $this->ownEmployeeIds($request), true), 403, 'You can only view interviews assigned to you.');

            $interview->load(['candidate.jobOpening:id,title', 'scorecards']);

            return $this->ok($this->presentForInterviewer($interview, $request->user()->id));
        }

        return $this->ok($interview->load(['candidate.jobOpening:id,title', 'interviewer:id,name,user_id', 'scorecards.submitter']));
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $interview = $this->resolveTenantModel(Interview::class, $id);

        if ($request->filled('candidate_id') && (int) $request->input('candidate_id') !== (int) $interview->candidate_id) {
            return $this->fail('An interview cannot be moved to a different candidate. Create a new interview instead.', 422);
        }

        $validated = $request->validate([
            'interviewer_id' => ['sometimes', 'nullable', $this->validateInterviewerBelongsToCompany($request)],
            'interviewer_name' => 'sometimes|nullable|string|max:255',
            'interview_type' => 'sometimes|in:' . self::TYPES,
            'scheduled_at' => 'sometimes|date',
            'duration_minutes' => 'sometimes|integer|min:15|max:480',
            'location' => 'sometimes|nullable|string|max:255',
            'meeting_link' => 'sometimes|nullable|url|max:500',
            'result' => 'sometimes|in:pending,pass,fail,hold',
            'feedback' => 'sometimes|nullable|string',
        ]);

        $scheduleChanged = false;

        if (array_key_exists('scheduled_at', $validated) && ! Carbon::parse($validated['scheduled_at'])->equalTo($interview->scheduled_at)) {
            $scheduleChanged = true;
        }
        if (array_key_exists('duration_minutes', $validated) && (int) $validated['duration_minutes'] !== (int) $interview->duration_minutes) {
            $scheduleChanged = true;
        }
        if (array_key_exists('interviewer_id', $validated) && (int) $validated['interviewer_id'] !== (int) $interview->interviewer_id) {
            $scheduleChanged = true;
        }

        if ($scheduleChanged) {
            if ($interview->status !== 'scheduled') {
                return $this->fail('Only scheduled interviews can be rescheduled.', 422);
            }

            $interviewerId = array_key_exists('interviewer_id', $validated) ? $validated['interviewer_id'] : $interview->interviewer_id;

            $this->assertNoConflicts(
                Carbon::parse($validated['scheduled_at'] ?? $interview->scheduled_at),
                (int) ($validated['duration_minutes'] ?? $interview->duration_minutes),
                $interviewerId ? (int) $interviewerId : null,
                (int) $interview->candidate_id,
                $interview->id
            );

            $validated['scorecard_reminded_at'] = null;
        }

        if (! empty($validated['interviewer_id'])) {
            $validated['interviewer_name'] = Employee::find($validated['interviewer_id'])?->name ?? ($validated['interviewer_name'] ?? $interview->interviewer_name);
        }

        $interview->update($validated);

        if ($scheduleChanged) {
            app(RecruitmentNotificationService::class)->interviewScheduled($interview->fresh(), $request->user()?->id, 'rescheduled');
            // Answers the candidate's request, if they made one, and tells them the new time.
            app(InterviewRescheduleService::class)->interviewMoved($interview->fresh(), $request->user()?->id);
        }

        return $this->ok($interview->load(['candidate', 'interviewer:id,name,user_id', 'scorecards']), 'Interview updated successfully');
    }

    public function cancel(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $interview = $this->resolveTenantModel(Interview::class, $id);

        if ($interview->status !== 'scheduled') {
            return $this->fail('Only scheduled interviews can be cancelled.', 422);
        }

        $validated = $request->validate(['reason' => 'nullable|string|max:1000']);

        $interview->update(['status' => 'cancelled', 'cancel_reason' => $validated['reason'] ?? null]);

        app(RecruitmentNotificationService::class)->interviewScheduled($interview, $request->user()?->id, 'cancelled');

        return $this->ok($interview->load(['candidate', 'interviewer:id,name,user_id']), 'Interview cancelled');
    }

    public function submitScorecard(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:interview', 'recruitment:view']);

        $interview = $this->resolveTenantModel(Interview::class, $id);
        $interview->loadMissing('interviewer');

        if (! $interview->interviewer || (int) $interview->interviewer->user_id !== (int) $request->user()?->id) {
            abort(403, 'Only the assigned interviewer can submit a scorecard.');
        }

        if ($interview->status === 'cancelled') {
            return $this->fail('This interview was cancelled.', 422);
        }

        if ($interview->scheduled_at->isFuture()) {
            return $this->fail('This interview has not taken place yet.', 422);
        }

        $validated = $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'recommendation' => 'required|in:' . implode(',', InterviewScorecard::RECOMMENDATIONS),
            'strengths' => 'nullable|string|max:5000',
            'concerns' => 'nullable|string|max:5000',
        ]);

        $scorecard = InterviewScorecard::updateOrCreate(
            ['interview_id' => $interview->id, 'submitted_by' => $request->user()->id],
            [...$validated, 'company_id' => $interview->company_id]
        );

        $interview->update([
            'status' => 'completed',
            'result' => InterviewScorecard::RESULT_BY_RECOMMENDATION[$validated['recommendation']],
        ]);

        app(RecruitmentNotificationService::class)->scorecardSubmitted($interview, $request->user()->id);

        return $this->ok($scorecard->load('submitter'), 'Scorecard submitted', 201);
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'recruitment:delete');

        $this->resolveTenantModel(Interview::class, $id)->delete();

        return $this->ok(null, 'Interview deleted successfully');
    }
}
