<?php

namespace Tests\Feature;

use App\Models\Bonus;
use App\Models\Candidate;
use App\Models\CandidateCheck;
use App\Models\CandidateStageHistory;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\JobOpening;
use App\Models\JobQuestion;
use App\Models\PipelineStage;
use App\Models\RecruitmentAgency;
use App\Models\ReferralBonus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Custom pipelines, screening/knockout questions, referrals and agencies, and reference/background/assessment checks.
 */
class RecruitmentPipelineDepthTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Department $department;

    private User $recruiter;

    private JobOpening $job;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->company = Company::create(['name' => 'Acme HR', 'careers_slug' => 'acme', 'careers_enabled' => true]);
        $this->grantLicense($this->company, ['recruitment']);
        $this->department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->job = $this->makeJob();
        Sanctum::actingAs($this->recruiter);
    }

    private function makeJob(array $overrides = []): JobOpening
    {
        return JobOpening::create(array_merge([
            'title' => 'Backend Engineer', 'department_id' => $this->department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 2, 'is_public' => true,
            'description' => 'Build APIs.', 'requirements' => 'PHP', 'salary_currency' => 'PKR',
        ], $overrides));
    }

    private function makeCandidate(array $overrides = [], ?JobOpening $job = null): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => ($job ?? $this->job)->id, 'company_id' => $this->company->id,
            'full_name' => 'Ali Khan', 'email' => 'ali' . uniqid() . '@example.com', 'stage' => 'applied',
        ], $overrides));
    }

    private function makeEmployee(string $name = 'Sara Referrer', ?Company $company = null): Employee
    {
        $company ??= $this->company;
        $user = User::factory()->create(['company_id' => $company->id, 'email' => strtolower(str_replace(' ', '.', $name)) . '@acme.test']);
        $this->createRole($user, User::ROLE_EMPLOYEE);

        return Employee::create([
            'user_id' => $user->id, 'company_id' => $company->id, 'name' => $name, 'email' => $user->email,
            'department_id' => $this->department->id, 'designation' => 'Engineer', 'status' => 'active', 'salary' => 1, 'basic_salary' => 1,
        ]);
    }

    private function createRole(User $user, string $roleName): void
    {
        $user->syncRoles([\App\Models\Role::where('name', $roleName)->whereNull('company_id')->firstOrFail()]);
    }

    /** Applied, Phone screen, Technical test, Panel interview, Reference check + Offer. */
    private function customPipeline(?JobOpening $job = null, array $skippable = []): array
    {
        $stages = [
            ['name' => 'Applied', 'category' => 'applied'],
            ['name' => 'Phone screen', 'category' => 'screening'],
            ['name' => 'Technical test', 'category' => 'interview'],
            ['name' => 'Panel interview', 'category' => 'interview'],
            ['name' => 'Reference check', 'category' => 'offer'],
            ['name' => 'Offer', 'category' => 'offer'],
        ];
        foreach ($stages as &$stage) {
            $stage['is_skippable'] = in_array($stage['name'], $skippable, true);
        }

        $response = $this->putJson('/api/v1/recruitment/pipeline', ['job_opening_id' => ($job ?? $this->job)->id, 'stages' => $stages])->assertOk();

        return collect($response->json('data.stages'))->keyBy('name')->all();
    }

    // ---- custom pipelines --------------------------------------------------------------

    public function test_a_job_can_have_its_own_pipeline_and_other_jobs_keep_the_default(): void
    {
        $stages = $this->customPipeline();
        $this->assertCount(6, $stages);

        $this->getJson('/api/v1/recruitment/pipeline?job_opening_id=' . $this->job->id)->assertOk()
            ->assertJsonPath('data.scope', 'job')->assertJsonCount(6, 'data.stages');

        $other = $this->makeJob(['title' => 'Designer']);
        $this->getJson('/api/v1/recruitment/pipeline?job_opening_id=' . $other->id)->assertOk()
            ->assertJsonPath('data.scope', 'default')->assertJsonCount(4, 'data.stages');
    }

    public function test_pipeline_validation_requires_every_category_in_order(): void
    {
        $base = ['job_opening_id' => $this->job->id];

        $this->putJson('/api/v1/recruitment/pipeline', $base + ['stages' => [
            ['name' => 'Applied', 'category' => 'applied'], ['name' => 'Screen', 'category' => 'screening'],
            ['name' => 'Interview', 'category' => 'interview'], ['name' => 'Interview 2', 'category' => 'interview'],
        ]])->assertStatus(422)->assertJsonValidationErrors('stages');

        $this->putJson('/api/v1/recruitment/pipeline', $base + ['stages' => [
            ['name' => 'Applied', 'category' => 'applied'], ['name' => 'Offer', 'category' => 'offer'],
            ['name' => 'Screen', 'category' => 'screening'], ['name' => 'Interview', 'category' => 'interview'],
        ]])->assertStatus(422)->assertJsonValidationErrors('stages');

        $this->putJson('/api/v1/recruitment/pipeline', $base + ['stages' => [
            ['name' => 'Same', 'category' => 'applied'], ['name' => 'same', 'category' => 'screening'],
            ['name' => 'Interview', 'category' => 'interview'], ['name' => 'Offer', 'category' => 'offer'],
        ]])->assertStatus(422)->assertJsonValidationErrors('stages');
    }

    public function test_custom_stages_cannot_be_skipped_unless_marked_skippable(): void
    {
        $stages = $this->customPipeline();
        $candidate = $this->makeCandidate();

        // Applied -> Technical test would skip the (required) phone screen.
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])
            ->assertStatus(422)->assertJsonFragment(['message' => 'Invalid candidate stage transition from "Applied" to "Technical test": the "Phone screen" stage cannot be skipped.']);

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Phone screen']['id']])
            ->assertOk()->assertJsonPath('data.stage', 'screening')->assertJsonPath('data.pipeline.current.name', 'Phone screen');

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])
            ->assertOk()->assertJsonPath('data.stage', 'interview');
        // Two interview rounds are separate stages inside one category.
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Panel interview']['id']])
            ->assertOk()->assertJsonPath('data.pipeline.current.name', 'Panel interview');

        $last = CandidateStageHistory::where('candidate_id', $candidate->id)->latest('id')->first();
        $this->assertSame(['Technical test', 'Panel interview'], [$last->from_label, $last->to_label]);
    }

    public function test_a_skippable_stage_can_be_bypassed_and_categories_still_work_for_category_only_moves(): void
    {
        $stages = $this->customPipeline(skippable: ['Phone screen']);
        $candidate = $this->makeCandidate();

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])->assertOk();

        // Moving by category name goes to the first stage of that category.
        $second = $this->makeCandidate(['stage' => 'screening']);
        $this->patchJson("/api/v1/candidates/{$second->id}/stage", ['stage' => 'interview'])->assertOk()
            ->assertJsonPath('data.pipeline.current.name', 'Technical test');
    }

    public function test_going_back_is_only_allowed_inside_a_category(): void
    {
        $stages = $this->customPipeline(skippable: ['Phone screen']);
        $candidate = $this->makeCandidate();
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Panel interview']['id']])->assertStatus(422);
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])->assertOk();
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Panel interview']['id']])->assertOk();

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])->assertOk();
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'screening'])->assertStatus(422);
    }

    public function test_a_rejected_candidate_can_only_be_reopened_to_where_they_were_or_earlier(): void
    {
        $stages = $this->customPipeline(skippable: ['Phone screen']);
        $candidate = $this->makeCandidate();
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])->assertOk();
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'rejected', 'reason' => 'Failed the test'])->assertOk();

        $response = $this->getJson("/api/v1/candidates/{$candidate->id}")->assertOk();
        $response->assertJsonPath('data.pipeline.reopen_to.name', 'Technical test');

        // Further along than the rejection: not allowed.
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Panel interview']['id']])->assertStatus(422);
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])
            ->assertOk()->assertJsonPath('data.stage', 'interview')->assertJsonPath('data.rejection_reason', null);
    }

    public function test_removing_a_stage_moves_its_candidates_to_the_next_stage_of_the_category(): void
    {
        $stages = $this->customPipeline(skippable: ['Phone screen']);
        $candidate = $this->makeCandidate();
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])->assertOk();

        $kept = collect($stages)->reject(fn ($stage) => $stage['name'] === 'Technical test')->values()->map(fn ($stage) => [
            'id' => $stage['id'], 'name' => $stage['name'], 'category' => $stage['category'], 'is_skippable' => $stage['is_skippable'],
        ])->all();

        $this->putJson('/api/v1/recruitment/pipeline', ['job_opening_id' => $this->job->id, 'stages' => $kept])->assertOk();

        $this->getJson("/api/v1/candidates/{$candidate->id}")->assertJsonPath('data.pipeline.current.name', 'Panel interview');
    }

    public function test_company_default_pipeline_applies_until_a_job_overrides_it_and_reset_restores_it(): void
    {
        $this->putJson('/api/v1/recruitment/pipeline', ['stages' => [
            ['name' => 'New', 'category' => 'applied'], ['name' => 'Recruiter call', 'category' => 'screening'],
            ['name' => 'Interview', 'category' => 'interview'], ['name' => 'Offer', 'category' => 'offer'],
        ]])->assertOk()->assertJsonPath('data.scope', 'company');

        $this->getJson('/api/v1/recruitment/pipeline?job_opening_id=' . $this->job->id)->assertJsonPath('data.scope', 'company');

        $this->customPipeline();
        $this->getJson('/api/v1/recruitment/pipeline?job_opening_id=' . $this->job->id)->assertJsonPath('data.scope', 'job');

        $this->deleteJson('/api/v1/recruitment/pipeline?job_opening_id=' . $this->job->id)->assertOk()->assertJsonPath('data.scope', 'company');
        $this->deleteJson('/api/v1/recruitment/pipeline')->assertOk()->assertJsonPath('data.scope', 'default');
        $this->assertSame(0, PipelineStage::query()->count());
    }

    public function test_the_board_uses_the_pipeline_of_the_selected_job(): void
    {
        $stages = $this->customPipeline(skippable: ['Phone screen']);
        $candidate = $this->makeCandidate();
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['pipeline_stage_id' => $stages['Technical test']['id']])->assertOk();

        $board = $this->getJson('/api/v1/recruitment/board?job_opening_id=' . $this->job->id)->assertOk();
        $columns = collect($board->json('data.stages'));
        $this->assertSame(['Applied', 'Phone screen', 'Technical test', 'Panel interview', 'Reference check', 'Offer', 'Hired', 'Rejected'], $columns->pluck('name')->all());
        $this->assertSame(1, $columns->firstWhere('name', 'Technical test')['count']);
        $this->assertSame(0, $columns->firstWhere('name', 'Panel interview')['count']);

        $this->getJson('/api/v1/recruitment/board')->assertOk()->assertJsonCount(6, 'data.stages');
    }

    public function test_pipeline_changes_need_the_right_permission_and_stay_in_the_company(): void
    {
        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo(['recruitment:view']);
        Sanctum::actingAs($viewer);
        $this->putJson('/api/v1/recruitment/pipeline', ['job_opening_id' => $this->job->id, 'stages' => []])->assertStatus(403);

        $foreign = JobOpening::create(['title' => 'Elsewhere', 'company_id' => Company::create(['name' => 'Other'])->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        Sanctum::actingAs($this->recruiter);
        $this->getJson('/api/v1/recruitment/pipeline?job_opening_id=' . $foreign->id)->assertStatus(403);
    }

    // ---- screening and knockout questions -----------------------------------------------------

    private function questions(array $extra = []): array
    {
        $response = $this->putJson("/api/v1/job-openings/{$this->job->id}/questions", array_merge(['questions' => [
            ['label' => 'Are you authorised to work in Pakistan?', 'type' => 'yes_no', 'required' => true, 'knockout' => ['operator' => 'eq', 'value' => 'yes']],
            ['label' => 'Years of PHP experience', 'type' => 'number', 'required' => true, 'knockout' => ['operator' => 'gte', 'value' => 2]],
            ['label' => 'Notice period', 'type' => 'single_choice', 'options' => ['Immediate', '1 month', '3 months'], 'required' => false, 'knockout' => ['operator' => 'in', 'value' => ['Immediate', '1 month']]],
            ['label' => 'Expected salary', 'type' => 'text'],
        ]], $extra))->assertOk();

        return $response->json('data.questions');
    }

    private function apply(array $answers, array $overrides = [])
    {
        return $this->post("/api/v1/public/careers/acme/jobs/{$this->job->id}/apply", array_merge([
            'full_name' => 'Zara Applicant', 'email' => 'zara@example.com', 'phone' => '0300',
            'resume' => UploadedFile::fake()->create('cv.pdf', 100, 'application/pdf'),
            'answers' => $answers,
        ], $overrides), ['Accept' => 'application/json']);
    }

    public function test_the_public_job_page_lists_questions_without_the_knockout_rules(): void
    {
        $this->questions();

        $response = $this->getJson("/api/v1/public/careers/acme/jobs/{$this->job->id}")->assertOk();
        $response->assertJsonCount(4, 'data.job.questions');
        $this->assertStringNotContainsString('knockout', json_encode($response->json('data.job.questions')));
        $this->assertStringNotContainsString('operator', json_encode($response->json()));
    }

    public function test_question_setup_is_validated(): void
    {
        $this->putJson("/api/v1/job-openings/{$this->job->id}/questions", ['questions' => [['label' => 'Pick one', 'type' => 'single_choice', 'options' => ['Only one']]]])
            ->assertStatus(422);
        $this->putJson("/api/v1/job-openings/{$this->job->id}/questions", ['questions' => [['label' => 'Why?', 'type' => 'textarea', 'knockout' => ['operator' => 'eq', 'value' => 'x']]]])
            ->assertStatus(422);
        $this->putJson("/api/v1/job-openings/{$this->job->id}/questions", ['questions' => [['label' => 'Pick', 'type' => 'single_choice', 'options' => ['A', 'B'], 'knockout' => ['operator' => 'in', 'value' => ['C']]]]])
            ->assertStatus(422);
    }

    public function test_required_answers_are_enforced_and_valid_answers_are_stored(): void
    {
        $questions = collect($this->questions())->keyBy('label');
        $auth = $questions['Are you authorised to work in Pakistan?']['id'];
        $years = $questions['Years of PHP experience']['id'];
        $notice = $questions['Notice period']['id'];

        $this->apply([$auth => 'yes'])->assertStatus(422)->assertJsonValidationErrors("answers.{$years}");
        $this->apply([$auth => 'yes', $years => 'lots'])->assertStatus(422)->assertJsonValidationErrors("answers.{$years}");
        $this->apply([$auth => 'yes', $years => 4, $notice => 'Whenever'])->assertStatus(422)->assertJsonValidationErrors("answers.{$notice}");

        $this->apply([$auth => 'yes', $years => 4, $notice => 'Immediate'])->assertCreated();

        $candidate = Candidate::where('email', 'zara@example.com')->firstOrFail();
        $this->assertSame('applied', $candidate->stage);
        $this->assertFalse($candidate->knockout_failed);
        $this->assertSame('careers', $candidate->source_type);
        $this->assertSame(3, $candidate->answers()->count());

        $detail = $this->getJson("/api/v1/candidates/{$candidate->id}")->assertOk();
        $this->assertSame('Immediate', collect($detail->json('data.answers'))->firstWhere('question', 'Notice period')['answer'][0]);
    }

    public function test_a_failed_knockout_answer_rejects_the_application_automatically(): void
    {
        Mail::fake();
        $questions = collect($this->questions())->keyBy('label');
        $auth = $questions['Are you authorised to work in Pakistan?']['id'];
        $years = $questions['Years of PHP experience']['id'];

        $this->apply([$auth => 'no', $years => 5, $questions['Notice period']['id'] => 'Immediate'])->assertCreated();

        $candidate = Candidate::where('email', 'zara@example.com')->firstOrFail();
        $this->assertSame('rejected', $candidate->stage);
        $this->assertTrue($candidate->knockout_failed);
        $this->assertStringContainsString('Are you authorised to work in Pakistan?', $candidate->rejection_reason);
        $this->assertTrue($candidate->answers()->where('knocked_out', true)->exists());
        $this->assertDatabaseHas('candidate_stage_histories', ['candidate_id' => $candidate->id, 'to_stage' => 'rejected']);

        // A reviewer can still reopen it (it was rejected from the first stage).
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'applied'])->assertOk()->assertJsonPath('data.stage', 'applied');
    }

    public function test_with_auto_reject_off_the_application_is_only_flagged(): void
    {
        $questions = collect($this->questions(['auto_reject_knockouts' => false]))->keyBy('label');
        $auth = $questions['Are you authorised to work in Pakistan?']['id'];
        $years = $questions['Years of PHP experience']['id'];

        $this->apply([$auth => 'yes', $years => 1, $questions['Notice period']['id'] => 'Immediate'])->assertCreated();

        $candidate = Candidate::where('email', 'zara@example.com')->firstOrFail();
        $this->assertSame('applied', $candidate->stage);
        $this->assertTrue($candidate->knockout_failed);

        $this->getJson('/api/v1/candidates?knockout_failed=1')->assertOk()->assertJsonCount(1, 'data.data');
    }

    public function test_editing_questions_keeps_the_wording_of_old_answers(): void
    {
        $questions = collect($this->questions())->keyBy('label');
        $auth = $questions['Are you authorised to work in Pakistan?']['id'];
        $years = $questions['Years of PHP experience']['id'];
        $this->apply([$auth => 'yes', $years => 3, $questions['Notice period']['id'] => '1 month'])->assertCreated();

        $this->putJson("/api/v1/job-openings/{$this->job->id}/questions", ['questions' => []])->assertOk();

        $this->assertSame(0, JobQuestion::count());
        $candidate = Candidate::where('email', 'zara@example.com')->firstOrFail();
        $this->assertSame('Years of PHP experience', $candidate->answers()->where('type', 'number')->first()->question);
    }

    // ---- referrals and agencies -----------------------------------------------------

    public function test_staff_can_credit_an_employee_referral_and_a_bonus_is_tracked(): void
    {
        $sara = $this->makeEmployee();
        $this->putJson("/api/v1/job-openings/{$this->job->id}", ['referral_bonus_amount' => 25000])->assertOk();

        $response = $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $this->job->id, 'full_name' => 'Bilal Referred', 'email' => 'bilal@example.com',
            'source_type' => 'referral', 'referrer_employee_id' => $sara->id,
        ])->assertCreated();

        $this->assertSame('Employee referral: Sara Referrer', $response->json('data.source'));
        $bonus = ReferralBonus::firstOrFail();
        $this->assertSame(['tracking', $sara->id], [$bonus->status, $bonus->employee_id]);
        $this->assertEquals(25000, $bonus->amount);

        // Referral without an employee, and an employee from another company, are rejected.
        $this->postJson('/api/v1/candidates', ['job_opening_id' => $this->job->id, 'full_name' => 'X', 'email' => 'x@example.com', 'source_type' => 'referral'])
            ->assertStatus(422)->assertJsonValidationErrors('referrer_employee_id');
        $foreign = $this->makeEmployee('Outsider', Company::create(['name' => 'Other']));
        $this->postJson('/api/v1/candidates', ['job_opening_id' => $this->job->id, 'full_name' => 'X', 'email' => 'x@example.com', 'source_type' => 'referral', 'referrer_employee_id' => $foreign->id])
            ->assertStatus(422)->assertJsonValidationErrors('referrer_employee_id');

        // Changing the source back removes the tracker while nothing has been earned yet.
        $this->putJson('/api/v1/candidates/' . $response->json('data.id'), ['source_type' => 'direct'])->assertOk();
        $this->assertSame(0, ReferralBonus::count());
    }

    public function test_the_bonus_becomes_payable_after_the_waiting_period_and_is_paid_through_payroll(): void
    {
        $sara = $this->makeEmployee();
        $this->company->update(['referral_bonus_amount' => 10000, 'referral_bonus_wait_days' => 30]);
        $candidate = $this->makeCandidate(['stage' => 'offer', 'full_name' => 'Bilal Referred', 'source_type' => 'referral', 'referrer_employee_id' => $sara->id]);
        app(\App\Services\Recruitment\ReferralService::class)->sync($candidate);

        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 150000, 'joining_date' => now()->toDateString(), 'skip_offer' => true])->assertOk();

        $bonus = ReferralBonus::firstOrFail();
        $this->assertSame('pending', $bonus->status);
        $this->assertSame(now()->addDays(30)->toDateString(), $bonus->eligible_on->toDateString());
        $this->postJson("/api/v1/recruitment/referral-bonuses/{$bonus->id}/approve")->assertStatus(422);

        $this->travel(31)->days();
        $this->getJson('/api/v1/recruitment/referral-bonuses')->assertOk()->assertJsonPath('data.bonuses.0.status', 'eligible');

        $this->postJson("/api/v1/recruitment/referral-bonuses/{$bonus->id}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $payroll = Bonus::firstOrFail();
        $this->assertSame([$sara->id, '10000.00'], [$payroll->employee_id, (string) $payroll->amount]);

        $this->postJson("/api/v1/recruitment/referral-bonuses/{$bonus->id}/pay")->assertOk()->assertJsonPath('data.status', 'paid');
        $this->postJson("/api/v1/recruitment/referral-bonuses/{$bonus->id}/cancel")->assertStatus(422);
    }

    public function test_a_bonus_is_cancelled_when_the_referred_hire_leaves_early(): void
    {
        $sara = $this->makeEmployee();
        $this->company->update(['referral_bonus_amount' => 10000, 'referral_bonus_wait_days' => 30]);
        $candidate = $this->makeCandidate(['stage' => 'offer', 'source_type' => 'referral', 'referrer_employee_id' => $sara->id]);
        app(\App\Services\Recruitment\ReferralService::class)->sync($candidate);
        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 100000, 'joining_date' => now()->toDateString(), 'skip_offer' => true])->assertOk();

        Employee::whereKey($candidate->fresh()->employee_id)->update(['status' => 'inactive']);
        $this->travel(31)->days();

        $this->getJson('/api/v1/recruitment/referral-bonuses')->assertOk()->assertJsonPath('data.bonuses.0.status', 'cancelled');
    }

    public function test_agencies_are_tracked_and_cannot_be_deleted_once_used(): void
    {
        $agency = $this->postJson('/api/v1/recruitment/agencies', ['name' => 'TalentBridge', 'fee_percent' => 8.5, 'email' => 'hello@talentbridge.test'])
            ->assertCreated()->json('data');

        $candidate = $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $this->job->id, 'full_name' => 'Agency Person', 'email' => 'ap@example.com',
            'source_type' => 'agency', 'agency_id' => $agency['id'],
        ])->assertCreated();

        $this->getJson('/api/v1/recruitment/agencies')->assertOk()->assertJsonPath('data.0.candidates_count', 1);
        $this->deleteJson("/api/v1/recruitment/agencies/{$agency['id']}")->assertStatus(422);

        // Fee is a percentage of the offer salary at hire time.
        Candidate::whereKey($candidate->json('data.id'))->update(['stage' => 'offer']);
        $this->postJson('/api/v1/candidates/' . $candidate->json('data.id') . '/hire', ['salary' => 200000, 'joining_date' => now()->toDateString(), 'skip_offer' => true])->assertOk();
        $this->assertEquals(17000, ReferralBonus::firstOrFail()->amount);

        $foreignAgency = RecruitmentAgency::create(['name' => 'Foreign', 'company_id' => Company::create(['name' => 'Other'])->id]);
        $this->postJson('/api/v1/candidates', ['job_opening_id' => $this->job->id, 'full_name' => 'Y', 'email' => 'y@example.com', 'source_type' => 'agency', 'agency_id' => $foreignAgency->id])
            ->assertStatus(422)->assertJsonValidationErrors('agency_id');
        $this->putJson("/api/v1/recruitment/agencies/{$foreignAgency->id}", ['name' => 'Hijack'])->assertStatus(403);
    }

    public function test_an_employee_can_refer_a_candidate_and_only_sees_their_own_referrals(): void
    {
        $sara = $this->makeEmployee();
        $tariq = $this->makeEmployee('Tariq Other');
        Sanctum::actingAs(User::find($sara->user_id));

        $this->getJson('/api/v1/referrals/jobs')->assertOk()->assertJsonPath('data.0.title', 'Backend Engineer');

        $this->post('/api/v1/referrals', [
            'job_opening_id' => $this->job->id, 'full_name' => 'Nida Friend', 'email' => 'nida@example.com', 'note' => 'Great at APIs',
            'resume' => UploadedFile::fake()->create('cv.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $candidate = Candidate::where('email', 'nida@example.com')->firstOrFail();
        $this->assertSame([$sara->id, 'referral', 'applied'], [$candidate->referrer_employee_id, $candidate->source_type, $candidate->stage]);
        $this->assertTrue($candidate->has_resume);
        $this->assertSame('tracking', ReferralBonus::firstOrFail()->status);

        // Same person again, or the employee's own address, is refused.
        $this->postJson('/api/v1/referrals', ['job_opening_id' => $this->job->id, 'full_name' => 'Nida', 'email' => 'NIDA@example.com'])->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson('/api/v1/referrals', ['job_opening_id' => $this->job->id, 'full_name' => 'Me', 'email' => $sara->email])->assertStatus(422);

        $mine = $this->getJson('/api/v1/referrals/mine')->assertOk();
        $mine->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 'Received');
        $this->assertStringNotContainsString('email', json_encode($mine->json('data')));

        // Another employee sees none of it, and cannot read candidate records.
        Sanctum::actingAs(User::find($tariq->user_id));
        $this->getJson('/api/v1/referrals/mine')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/candidates/{$candidate->id}")->assertForbidden();
    }

    public function test_a_user_without_an_employee_record_cannot_refer(): void
    {
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/referrals/jobs')->assertForbidden();
        $this->postJson('/api/v1/referrals', ['job_opening_id' => $this->job->id, 'full_name' => 'A', 'email' => 'a@example.com'])->assertForbidden();
    }

    // ---- reference, background and assessment checks -----------------------------------------------------

    public function test_required_checks_must_be_cleared_before_a_hire(): void
    {
        $this->putJson("/api/v1/job-openings/{$this->job->id}", ['required_checks' => ['reference', 'background']])->assertOk();
        $candidate = $this->makeCandidate(['stage' => 'offer']);
        $hire = fn () => $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 100000, 'skip_offer' => true]);

        $hire()->assertStatus(422)->assertJsonValidationErrors('checks');

        $reference = $this->postJson("/api/v1/candidates/{$candidate->id}/checks", ['type' => 'reference', 'title' => 'Previous manager', 'contact_name' => 'Hina', 'contact_email' => 'hina@old.test'])
            ->assertCreated()->json('data.created_id');
        $background = $this->postJson("/api/v1/candidates/{$candidate->id}/checks", ['type' => 'background', 'title' => 'Criminal record', 'provider' => 'VerifyPK'])
            ->assertCreated()->json('data.created_id');

        $hire()->assertStatus(422);
        $this->putJson("/api/v1/candidate-checks/{$reference}", ['status' => 'passed'])->assertOk()->assertJsonPath('data.summary.unmet.0.type', 'background');
        $hire()->assertStatus(422);

        $this->putJson("/api/v1/candidate-checks/{$background}", ['status' => 'failed', 'result_notes' => 'Discrepancy'])->assertOk();
        $hire()->assertStatus(422);

        // Waiving needs a reason and recruitment settings access.
        $this->postJson("/api/v1/candidate-checks/{$background}/waive", [])->assertStatus(422);
        $this->postJson("/api/v1/candidate-checks/{$background}/waive", ['reason' => 'Verified directly with the court'])->assertOk();
        $hire()->assertOk();
    }

    public function test_a_check_that_is_not_required_never_blocks_a_hire(): void
    {
        $candidate = $this->makeCandidate(['stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$candidate->id}/checks", ['type' => 'assessment', 'title' => 'Coding test'])->assertCreated();

        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 100000, 'skip_offer' => true])->assertOk();
    }

    public function test_assessments_with_a_pass_mark_decide_themselves(): void
    {
        $candidate = $this->makeCandidate();
        $id = $this->postJson("/api/v1/candidates/{$candidate->id}/checks", ['type' => 'assessment', 'title' => 'Coding test', 'max_score' => 100, 'pass_mark' => 60])
            ->assertCreated()->json('data.created_id');

        $this->putJson("/api/v1/candidate-checks/{$id}", ['score' => 45])->assertOk();
        $this->assertSame('failed', CandidateCheck::find($id)->status);

        $this->putJson("/api/v1/candidate-checks/{$id}", ['score' => 82])->assertOk();
        $check = CandidateCheck::find($id);
        $this->assertSame(['passed', $this->recruiter->id], [$check->status, $check->completed_by]);

        $this->putJson("/api/v1/candidate-checks/{$id}", ['status' => 'waived'])->assertStatus(422);
    }

    public function test_a_referee_answers_through_a_private_link(): void
    {
        Mail::fake();
        $candidate = $this->makeCandidate(['full_name' => 'Zoya Candidate']);
        $id = $this->postJson("/api/v1/candidates/{$candidate->id}/checks", [
            'type' => 'reference', 'title' => 'Last manager', 'contact_name' => 'Hina Rao', 'contact_email' => 'hina@old.test', 'send_request' => true,
        ])->assertCreated()->assertJsonPath('data.email_sent', true)->json('data.created_id');

        $token = null;
        Mail::assertSentCount(0); // raw mails are not "Mailable"s, so read the token from the stored hash instead
        $check = CandidateCheck::find($id);
        $this->assertNotNull($check->response_token_hash);
        $this->assertNotNull($check->requested_at);

        // A fresh link is issued; only its plain value works.
        $issued = app(\App\Services\Recruitment\CandidateCheckService::class)->sendReferenceRequest($check);
        $token = basename($issued['url']);

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/public/references/not-a-real-token')->assertNotFound();
        $this->getJson("/api/v1/public/references/{$token}")->assertOk()
            ->assertJsonPath('data.candidate_name', 'Zoya Candidate')->assertJsonPath('data.already_submitted', false);

        $this->postJson("/api/v1/public/references/{$token}", ['answers' => ['strengths' => 'Reliable']])->assertStatus(422);
        $this->postJson("/api/v1/public/references/{$token}", ['answers' => [
            'relationship_duration' => '3 years, direct manager', 'strengths' => 'Reliable', 'reliability' => 5, 'overall' => 4, 'would_rehire' => 'yes',
        ]])->assertCreated();

        $check = CandidateCheck::find($id);
        $this->assertSame('in_progress', $check->status);
        $this->assertSame(4, $check->response['overall']);
        $this->assertNull($check->response_token_hash);

        // The link is single use.
        $this->getJson("/api/v1/public/references/{$token}")->assertNotFound();

        $this->assertDatabaseHas('notifications', ['title' => 'Reference received: Zoya Candidate']);
    }

    public function test_checks_stay_within_the_company_and_documents_must_belong_to_the_candidate(): void
    {
        $candidate = $this->makeCandidate();
        $other = $this->makeCandidate(['email' => 'other@example.com']);
        $document = \App\Models\CandidateDocument::create(['company_id' => $this->company->id, 'candidate_id' => $other->id, 'label' => 'Report', 'status' => 'uploaded']);

        $this->postJson("/api/v1/candidates/{$candidate->id}/checks", ['type' => 'background', 'title' => 'Check', 'document_id' => $document->id])
            ->assertStatus(422)->assertJsonValidationErrors('document_id');

        $id = $this->postJson("/api/v1/candidates/{$candidate->id}/checks", ['type' => 'background', 'title' => 'Check'])->json('data.created_id');

        $intruder = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => Company::create(['name' => 'Other'])->id]);
        Sanctum::actingAs($intruder);
        $this->putJson("/api/v1/candidate-checks/{$id}", ['status' => 'passed'])->assertStatus(403);
        $this->getJson("/api/v1/candidates/{$candidate->id}/checks")->assertStatus(403);
    }

    public function test_merging_duplicates_keeps_answers_checks_and_the_referral(): void
    {
        $sara = $this->makeEmployee();
        $otherJob = $this->makeJob(['title' => 'Support Engineer']);
        $keep = $this->makeCandidate(['email' => 'same@example.com', 'phone' => '0300 1234567']);
        $dupe = $this->makeCandidate(['email' => 'same@example.com', 'source_type' => 'referral', 'referrer_employee_id' => $sara->id], $otherJob);
        app(\App\Services\Recruitment\ReferralService::class)->sync($dupe);
        $this->postJson("/api/v1/candidates/{$dupe->id}/checks", ['type' => 'background', 'title' => 'Record check'])->assertCreated();
        \App\Models\CandidateAnswer::create(['company_id' => $this->company->id, 'candidate_id' => $dupe->id, 'question' => 'Notice?', 'type' => 'text', 'answer' => ['Now'], 'knocked_out' => false]);

        $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$dupe->id]])->assertOk();

        $keep = $keep->fresh();
        $this->assertSame(1, $keep->checks()->count());
        $this->assertSame(1, $keep->answers()->count());
        $this->assertSame(['referral', $sara->id], [$keep->source_type, $keep->referrer_employee_id]);
        $this->assertSame($keep->id, ReferralBonus::firstOrFail()->candidate_id);
    }

    public function test_erasing_a_candidate_removes_answers_and_referee_details(): void
    {
        $candidate = $this->makeCandidate(['knockout_failed' => true]);
        \App\Models\CandidateAnswer::create(['company_id' => $this->company->id, 'candidate_id' => $candidate->id, 'question' => 'Notice?', 'type' => 'text', 'answer' => ['Now'], 'knocked_out' => false]);
        $this->postJson("/api/v1/candidates/{$candidate->id}/checks", ['type' => 'reference', 'title' => 'Ref', 'contact_name' => 'Hina', 'contact_email' => 'hina@old.test', 'result_notes' => 'Says good things'])->assertCreated();

        $this->postJson("/api/v1/candidates/{$candidate->id}/erase")->assertOk();

        $this->assertSame(0, $candidate->answers()->count());
        $check = CandidateCheck::firstOrFail();
        $this->assertSame([null, null, null], [$check->contact_name, $check->contact_email, $check->result_notes]);
        $this->assertFalse($candidate->fresh()->knockout_failed);
    }
}
