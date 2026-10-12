<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\NotificationItem;
use App\Models\OnboardingTask;
use App\Models\OnboardingTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentOnboardingTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private User $hiringManager;

    private User $itSupport;

    private JobOpening $job;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company, ['recruitment']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->hiringManager = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $this->company->id, 'name' => 'Hana Manager']);
        $this->itSupport = $this->createUserWithRole(User::ROLE_IT_SUPPORT, ['company_id' => $this->company->id, 'name' => 'Ivan IT']);
        $this->job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 5,
            'hiring_manager_id' => $this->hiringManager->id, 'recruiter_id' => $this->recruiter->id,
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function template(array $overrides = [], ?array $tasks = null): int
    {
        return $this->postJson('/api/v1/onboarding-templates', array_merge([
            'name' => 'Standard',
            'is_default' => true,
            'tasks' => $tasks ?? [
                ['title' => 'Sign contract', 'assignee_type' => 'recruiter', 'due_offset_days' => 0],
                ['title' => 'Prepare laptop', 'assignee_type' => 'user', 'assignee_user_id' => $this->itSupport->id, 'due_offset_days' => -2, 'link_type' => 'inventory'],
                ['title' => 'Team intro', 'assignee_type' => 'hiring_manager', 'due_offset_days' => 1],
                ['title' => 'Upload CNIC copy', 'assignee_type' => 'new_hire', 'due_offset_days' => 3, 'link_type' => 'document'],
                ['title' => 'Unowned task', 'due_offset_days' => 7],
            ],
        ], $overrides))->assertCreated()->json('data.id');
    }

    private function hire(array $payload = [], string $email = 'new.hire@example.com'): Candidate
    {
        $candidate = Candidate::create([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id,
            'full_name' => 'New Hire', 'email' => $email, 'stage' => 'offer',
        ]);

        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", array_merge(['salary' => 100000, 'joining_date' => '2026-12-10', 'skip_offer' => true], $payload))
            ->assertOk();

        return $candidate->fresh();
    }

    // ---- templates ----------------------------------------------------------------

    public function test_templates_need_manage_settings_and_validate_assignees(): void
    {
        $id = $this->template();
        $this->getJson('/api/v1/onboarding-templates')->assertOk()->assertJsonCount(1, 'data')->assertJsonCount(5, 'data.0.tasks');

        $this->postJson('/api/v1/onboarding-templates', ['name' => 'X', 'tasks' => [['title' => 'T', 'assignee_type' => 'user']]])
            ->assertStatus(422)->assertJsonValidationErrors('tasks.0.assignee_user_id');

        $outsider = User::factory()->create(['company_id' => Company::create(['name' => 'Other'])->id]);
        $this->postJson('/api/v1/onboarding-templates', ['name' => 'X', 'tasks' => [['title' => 'T', 'assignee_type' => 'user', 'assignee_user_id' => $outsider->id]]])
            ->assertStatus(422)->assertJsonValidationErrors('tasks.0.assignee_user_id');
        $this->postJson('/api/v1/onboarding-templates', ['name' => 'X', 'tasks' => []])->assertStatus(422)->assertJsonValidationErrors('tasks');
        $this->postJson('/api/v1/onboarding-templates', ['name' => ''])->assertStatus(422);

        $hr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]); // no manage_settings
        Sanctum::actingAs($hr);
        $this->getJson('/api/v1/onboarding-templates')->assertOk();
        $this->postJson('/api/v1/onboarding-templates', ['name' => 'Nope', 'tasks' => []])->assertForbidden();
        $this->putJson("/api/v1/onboarding-templates/{$id}", ['name' => 'Nope'])->assertForbidden();
        $this->deleteJson("/api/v1/onboarding-templates/{$id}")->assertForbidden();
    }

    public function test_only_one_default_template_and_tasks_are_replaced_on_update(): void
    {
        $first = $this->template(['name' => 'First']);
        $second = $this->template(['name' => 'Second']);

        $this->assertFalse(OnboardingTemplate::find($first)->is_default);
        $this->assertTrue(OnboardingTemplate::find($second)->is_default);

        $this->putJson("/api/v1/onboarding-templates/{$first}", ['is_default' => true, 'tasks' => [['title' => 'Only task']]])
            ->assertOk()->assertJsonCount(1, 'data.tasks');
        $this->assertFalse(OnboardingTemplate::find($second)->is_default);
        $this->assertSame(1, OnboardingTemplate::find($first)->tasks()->count());

        $this->deleteJson("/api/v1/onboarding-templates/{$second}")->assertOk();
    }

    public function test_templates_are_isolated_between_companies(): void
    {
        $id = $this->template();
        $other = Company::create(['name' => 'Other']);
        $this->grantLicense($other, ['recruitment']);
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $other->id]));

        $this->getJson('/api/v1/onboarding-templates')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/onboarding-templates/{$id}")->assertForbidden();
        $this->putJson("/api/v1/onboarding-templates/{$id}", ['name' => 'Hijack'])->assertForbidden();
    }

    // ---- applying a template at hire time ---------------------------------------------

    public function test_hiring_creates_tasks_from_the_default_template_with_resolved_assignees_and_due_dates(): void
    {
        $this->template();
        $candidate = $this->hire();

        $tasks = $candidate->onboardingTasks()->get();
        $this->assertCount(5, $tasks);
        $this->assertSame('pending', $candidate->onboarding_status);

        $employeeUserId = User::where('email', 'new.hire@example.com')->value('id');
        $byTitle = $tasks->keyBy('title');
        $this->assertSame($this->recruiter->id, $byTitle['Sign contract']->assignee_id);
        $this->assertSame($this->itSupport->id, $byTitle['Prepare laptop']->assignee_id);
        $this->assertSame($this->hiringManager->id, $byTitle['Team intro']->assignee_id);
        $this->assertSame($employeeUserId, $byTitle['Upload CNIC copy']->assignee_id);
        $this->assertNull($byTitle['Unowned task']->assignee_id);

        $this->assertSame('2026-12-08', $byTitle['Prepare laptop']->due_date->toDateString()); // joining date - 2
        $this->assertSame('2026-12-13', $byTitle['Upload CNIC copy']->due_date->toDateString()); // + 3
        $this->assertSame('inventory', $byTitle['Prepare laptop']->link_type);
        $this->assertSame([0, 1, 2, 3, 4], $tasks->pluck('sort_order')->all());

        $this->assertSame(1, NotificationItem::where('user_id', $this->itSupport->id)->where('type', 'recruitment_task')->count());
        $this->assertSame(1, NotificationItem::where('user_id', $this->hiringManager->id)->where('type', 'recruitment_task')->count());
    }

    public function test_explicit_template_choice_overrides_the_default_and_foreign_templates_are_rejected(): void
    {
        $this->template(['name' => 'Default']);
        $light = $this->template(['name' => 'Light', 'is_default' => false], [['title' => 'Just one']]);

        $candidate = $this->hire(['template_id' => $light]);
        $this->assertSame(['Just one'], $candidate->onboardingTasks()->pluck('title')->all());

        $other = Company::create(['name' => 'Other']);
        $foreign = OnboardingTemplate::create(['company_id' => $other->id, 'name' => 'Foreign']);
        $second = Candidate::create(['job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'Two', 'email' => 'two@example.com', 'stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$second->id}/hire", ['salary' => 1, 'skip_offer' => true, 'template_id' => $foreign->id])
            ->assertStatus(422)->assertJsonValidationErrors('template_id');
        $this->assertSame('offer', $second->fresh()->stage);
    }

    public function test_hiring_without_any_template_creates_no_tasks(): void
    {
        $candidate = $this->hire();

        $this->assertSame(0, $candidate->onboardingTasks()->count());
        $this->assertSame('pending', $candidate->onboarding_status);
    }

    // ---- working the tasks ------------------------------------------------------------

    public function test_assignees_complete_their_own_tasks_and_progress_updates_the_status(): void
    {
        $this->template(tasks: [
            ['title' => 'Prepare laptop', 'assignee_type' => 'user', 'assignee_user_id' => $this->itSupport->id],
            ['title' => 'Team intro', 'assignee_type' => 'hiring_manager'],
        ]);
        $candidate = $this->hire();
        [$laptop, $intro] = $candidate->onboardingTasks()->get()->all();

        // The IT user has no recruitment access but may act on their own task.
        Sanctum::actingAs($this->itSupport);
        $mine = $this->getJson('/api/v1/onboarding-tasks')->assertOk()->assertJsonCount(1, 'data.data')->json('data.data.0');
        $this->assertSame($laptop->id, $mine['id']);
        $this->getJson('/api/v1/candidates')->assertForbidden();
        $this->getJson('/api/v1/onboarding')->assertForbidden();

        $this->postJson("/api/v1/onboarding-tasks/{$intro->id}/complete")->assertForbidden();
        $this->postJson("/api/v1/onboarding-tasks/{$laptop->id}/complete")->assertOk()->assertJsonPath('data.status', 'completed');
        $this->assertSame('in_progress', $candidate->fresh()->onboarding_status);
        $this->postJson("/api/v1/onboarding-tasks/{$laptop->id}/complete", ['status' => 'skipped'])->assertForbidden();

        Sanctum::actingAs($this->hiringManager);
        $this->postJson("/api/v1/onboarding-tasks/{$intro->id}/complete")->assertOk();
        $this->assertSame('completed', $candidate->fresh()->onboarding_status);

        Sanctum::actingAs($this->itSupport);
        $this->postJson("/api/v1/onboarding-tasks/{$laptop->id}/reopen")->assertOk()->assertJsonPath('data.completed_at', null);
        $this->assertSame('in_progress', $candidate->fresh()->onboarding_status);
    }

    public function test_recruiters_can_skip_add_edit_and_delete_tasks_and_deferred_status_is_respected(): void
    {
        $candidate = $this->hire();

        $taskId = $this->postJson('/api/v1/onboarding-tasks', [
            'candidate_id' => $candidate->id, 'title' => 'Order business cards', 'assignee_id' => $this->itSupport->id, 'due_date' => '2026-12-12',
        ])->assertCreated()->assertJsonPath('data.assignee.name', 'Ivan IT')->json('data.id');
        $this->assertSame(1, NotificationItem::where('user_id', $this->itSupport->id)->where('type', 'recruitment_task')->count());

        $this->putJson("/api/v1/onboarding-tasks/{$taskId}", ['title' => 'Order business cards (rush)', 'assignee_id' => $this->hiringManager->id])->assertOk();
        $this->assertSame(1, NotificationItem::where('user_id', $this->hiringManager->id)->where('type', 'recruitment_task')->count());

        $this->postJson("/api/v1/onboarding-tasks/{$taskId}/complete", ['status' => 'skipped'])->assertOk()->assertJsonPath('data.status', 'skipped');
        $this->assertSame('completed', $candidate->fresh()->onboarding_status); // skipped counts as done

        $candidate->update(['onboarding_status' => 'deferred']);
        $this->postJson("/api/v1/onboarding-tasks/{$taskId}/reopen")->assertOk();
        $this->assertSame('deferred', $candidate->fresh()->onboarding_status);

        $this->deleteJson("/api/v1/onboarding-tasks/{$taskId}")->assertOk();
        $this->assertNull(OnboardingTask::find($taskId));
        $this->postJson("/api/v1/onboarding-tasks/{$taskId}/complete")->assertNotFound();
    }

    public function test_tasks_can_only_be_added_to_hired_candidates_in_the_same_company_with_company_assignees(): void
    {
        $applied = Candidate::create(['job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'A', 'email' => 'a@example.com', 'stage' => 'applied']);
        $this->postJson('/api/v1/onboarding-tasks', ['candidate_id' => $applied->id, 'title' => 'Nope'])->assertStatus(422)->assertJsonValidationErrors('candidate_id');

        $hired = $this->hire();
        $stranger = User::factory()->create(['company_id' => Company::create(['name' => 'Other'])->id]);
        $this->postJson('/api/v1/onboarding-tasks', ['candidate_id' => $hired->id, 'title' => 'Bad', 'assignee_id' => $stranger->id])
            ->assertStatus(422)->assertJsonValidationErrors('assignee_id');
    }

    public function test_task_lists_are_filtered_and_progress_shows_on_the_onboarding_list(): void
    {
        $this->template(tasks: [['title' => 'One', 'assignee_type' => 'recruiter'], ['title' => 'Two', 'assignee_type' => 'recruiter']]);
        $first = $this->hire(email: 'first@example.com');
        $this->hire(email: 'second@example.com');
        $this->postJson("/api/v1/onboarding-tasks/{$first->onboardingTasks()->first()->id}/complete")->assertOk();

        $this->getJson("/api/v1/onboarding-tasks?candidate_id={$first->id}")->assertOk()->assertJsonCount(2, 'data.data');
        $this->getJson('/api/v1/onboarding-tasks?mine=1&status=pending')->assertOk()->assertJsonCount(3, 'data.data');

        $row = collect($this->getJson('/api/v1/onboarding')->assertOk()->json('data.data'))->firstWhere('id', $first->id);
        $this->assertSame([2, 1], [$row['tasks_total'], $row['tasks_done']]);
    }

    public function test_task_reminders_are_sent_once_for_due_tasks(): void
    {
        $candidate = $this->hire();
        OnboardingTask::create(['company_id' => $this->company->id, 'candidate_id' => $candidate->id, 'title' => 'Due today', 'assignee_id' => $this->itSupport->id, 'due_date' => now()->toDateString()]);
        OnboardingTask::create(['company_id' => $this->company->id, 'candidate_id' => $candidate->id, 'title' => 'Later', 'assignee_id' => $this->itSupport->id, 'due_date' => now()->addWeek()->toDateString()]);
        OnboardingTask::create(['company_id' => $this->company->id, 'candidate_id' => $candidate->id, 'title' => 'Done', 'assignee_id' => $this->itSupport->id, 'due_date' => now()->subDay()->toDateString(), 'status' => 'completed']);

        $this->artisan('recruitment:send-reminders')->assertSuccessful();
        $this->artisan('recruitment:send-reminders')->assertSuccessful();

        $this->assertSame(1, NotificationItem::where('user_id', $this->itSupport->id)->where('type', 'recruitment_task_due')->count());
    }

    public function test_onboarding_records_still_cannot_be_started_for_candidates_who_are_not_hired(): void
    {
        $applied = Candidate::create(['job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'A', 'email' => 'a@example.com', 'stage' => 'applied']);

        $this->postJson('/api/v1/onboarding', ['candidate_id' => $applied->id, 'onboarding_status' => 'pending'])->assertStatus(422);
    }
}
