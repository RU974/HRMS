<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\OnboardingTask;
use App\Models\OnboardingTemplateTask;
use App\Models\User;
use App\Services\Recruitment\OnboardingService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OnboardingTaskController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly OnboardingService $onboarding)
    {
    }

    private function canViewAll(Request $request): bool
    {
        $user = $request->user();

        return (bool) $user && ($user->hasAnyRole([User::ROLE_SUPER_ADMIN]) || $user->hasPermission('recruitment:view'));
    }

    private function assigneeRule(Request $request)
    {
        return Rule::exists('users', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
        });
    }

    private function present(OnboardingTask $task): OnboardingTask
    {
        $task->load(['assignee', 'candidate:id,full_name,employee_id,job_opening_id']);
        $task->candidate?->setAppends([]);

        return $task;
    }

    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:view', 'recruitment:onboarding_task']);

        $viewAll = $this->canViewAll($request);
        $query = OnboardingTask::with(['assignee', 'candidate:id,full_name,employee_id,job_opening_id'])
            ->orderBy('candidate_id')->orderBy('sort_order')->orderBy('id');

        if (! $viewAll || $request->boolean('mine')) {
            $query->where('assignee_id', $request->user()->id);
        }

        if ($viewAll && $request->filled('candidate_id')) {
            $query->where('candidate_id', $request->input('candidate_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $page = $query->paginate(min(max((int) $request->input('per_page', 50), 1), 200));
        $page->getCollection()->each(fn (OnboardingTask $task) => $task->candidate?->setAppends([]));

        return $this->ok($page);
    }

    public function store(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $validated = $request->validate([
            'candidate_id' => ['required', Rule::exists('candidates', 'id')->where(function ($query) use ($request) {
                if ($request->user()?->company_id) {
                    $query->where('company_id', $request->user()->company_id);
                }
            })],
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'assignee_id' => ['nullable', $this->assigneeRule($request)],
            'due_date' => 'nullable|date',
            'link_type' => 'sometimes|in:' . implode(',', OnboardingTemplateTask::LINK_TYPES),
        ]);

        $candidate = $this->resolveTenantModel(Candidate::class, $validated['candidate_id']);

        if ($candidate->stage !== 'hired') {
            throw ValidationException::withMessages(['candidate_id' => ['Tasks can only be added for hired candidates.']]);
        }

        unset($validated['candidate_id']);

        return $this->ok($this->present($this->onboarding->addTask($candidate, $validated, $request->user()->id)), 'Task added', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $task = $this->resolveTenantModel(OnboardingTask::class, $id);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string|max:2000',
            'assignee_id' => ['sometimes', 'nullable', $this->assigneeRule($request)],
            'due_date' => 'sometimes|nullable|date',
            'link_type' => 'sometimes|in:' . implode(',', OnboardingTemplateTask::LINK_TYPES),
        ]);

        $reassigned = array_key_exists('assignee_id', $validated)
            && $validated['assignee_id']
            && (int) $validated['assignee_id'] !== (int) $task->assignee_id;

        // A changed due date earns a fresh reminder.
        if (array_key_exists('due_date', $validated)) {
            $validated['reminded_at'] = null;
        }

        $task->update($validated);

        if ($reassigned) {
            $candidate = Candidate::query()->withoutGlobalScopes()->find($task->candidate_id);
            $candidate && $this->onboarding->notifyReassigned($task, $candidate, $request->user()->id);
        }

        return $this->ok($this->present($task), 'Task updated');
    }

    public function complete(Request $request, $id)
    {
        return $this->changeStatus($request, $id, $request->input('status', 'completed'));
    }

    public function reopen(Request $request, $id)
    {
        return $this->changeStatus($request, $id, 'pending');
    }

    private function changeStatus(Request $request, $id, string $status)
    {
        $this->authorizeAnyPermission($request, ['recruitment:edit', 'recruitment:onboarding_task']);

        abort_unless(in_array($status, OnboardingTask::STATUSES, true), 422, 'Invalid task status.');

        $task = $this->resolveTenantModel(OnboardingTask::class, $id);
        $canManage = $request->user()->hasAnyRole([User::ROLE_SUPER_ADMIN]) || $request->user()->hasPermission('recruitment:edit');

        if (! $canManage && (int) $task->assignee_id !== (int) $request->user()->id) {
            abort(403, 'You can only update tasks assigned to you.');
        }

        if ($status === 'skipped' && ! $canManage) {
            abort(403, 'Only recruiters can skip a task.');
        }

        return $this->ok($this->present($this->onboarding->setTaskStatus($task, $status, $request->user()->id)), 'Task updated');
    }

    public function destroy($id)
    {
        $this->authorizeAnyPermission(request(), ['recruitment:edit', 'recruitment:delete']);

        $task = $this->resolveTenantModel(OnboardingTask::class, $id);
        $candidate = Candidate::query()->withoutGlobalScopes()->find($task->candidate_id);
        $task->delete();

        $candidate && $this->onboarding->syncCandidateStatus($candidate);

        return $this->ok(null, 'Task deleted');
    }
}
