<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\OnboardingTemplate;
use App\Models\OnboardingTemplateTask;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OnboardingTemplateController extends Controller
{
    use EnsuresCompanyIsolation;

    private function rules(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name' => "{$required}|string|max:150",
            'description' => 'sometimes|nullable|string|max:1000',
            'is_default' => 'sometimes|boolean',
            'tasks' => "{$required}|array|max:60",
            'tasks.*.title' => 'required|string|max:255',
            'tasks.*.description' => 'nullable|string|max:2000',
            'tasks.*.assignee_type' => 'sometimes|in:' . implode(',', OnboardingTemplateTask::ASSIGNEE_TYPES),
            'tasks.*.assignee_user_id' => ['nullable', Rule::exists('users', 'id')->where(function ($query) use ($request) {
                if ($request->user()?->company_id) {
                    $query->where('company_id', $request->user()->company_id);
                }
            })],
            'tasks.*.due_offset_days' => 'sometimes|integer|min:-60|max:365',
            'tasks.*.link_type' => 'sometimes|in:' . implode(',', OnboardingTemplateTask::LINK_TYPES),
        ];
    }

    private function saveTasks(OnboardingTemplate $template, array $tasks): void
    {
        $template->tasks()->delete();

        foreach (array_values($tasks) as $index => $task) {
            $type = $task['assignee_type'] ?? 'unassigned';

            if ($type === 'user' && empty($task['assignee_user_id'])) {
                throw ValidationException::withMessages(["tasks.{$index}.assignee_user_id" => ['Pick the user this task is assigned to.']]);
            }

            $template->tasks()->create([
                'title' => trim($task['title']),
                'description' => $task['description'] ?? null,
                'assignee_type' => $type,
                'assignee_user_id' => $type === 'user' ? $task['assignee_user_id'] : null,
                'due_offset_days' => $task['due_offset_days'] ?? 0,
                'link_type' => $task['link_type'] ?? 'none',
                'sort_order' => $index,
            ]);
        }
    }

    private function makeOnlyDefault(OnboardingTemplate $template): void
    {
        OnboardingTemplate::query()
            ->where('company_id', $template->company_id)
            ->where('id', '!=', $template->id)
            ->update(['is_default' => false]);
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok(OnboardingTemplate::with(['tasks.assignee'])->orderByDesc('is_default')->orderBy('name')->get());
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        return $this->ok($this->resolveTenantModel(OnboardingTemplate::class, $id)->load('tasks.assignee'));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $validated = $request->validate($this->rules($request, true));

        $template = DB::transaction(function () use ($validated, $request) {
            $template = OnboardingTemplate::create([
                'company_id' => $request->user()?->company_id,
                'name' => trim($validated['name']),
                'description' => $validated['description'] ?? null,
                'is_default' => (bool) ($validated['is_default'] ?? false),
            ]);

            $this->saveTasks($template, $validated['tasks']);

            if ($template->is_default) {
                $this->makeOnlyDefault($template);
            }

            return $template;
        });

        return $this->ok($template->load('tasks.assignee'), 'Template created', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $template = $this->resolveTenantModel(OnboardingTemplate::class, $id);
        $validated = $request->validate($this->rules($request, false));

        DB::transaction(function () use ($template, $validated) {
            $template->update(collect($validated)->only(['name', 'description', 'is_default'])->all());

            if (array_key_exists('tasks', $validated)) {
                $this->saveTasks($template, $validated['tasks']);
            }

            if ($template->is_default) {
                $this->makeOnlyDefault($template);
            }
        });

        return $this->ok($template->fresh()->load('tasks.assignee'), 'Template updated');
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'recruitment:manage_settings');

        $this->resolveTenantModel(OnboardingTemplate::class, $id)->delete();

        return $this->ok(null, 'Template deleted');
    }
}
