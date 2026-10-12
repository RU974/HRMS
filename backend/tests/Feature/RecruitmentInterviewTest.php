<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentInterviewTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Department $department;

    private User $recruiter;

    private JobOpening $job;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company, ['recruitment']);
        $this->department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $this->department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 3,
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function candidate(string $email = 'ali@example.com', array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id,
            'full_name' => 'Candidate ' . $email, 'email' => $email, 'stage' => 'interview',
        ], $overrides));
    }

    /** @return array{0: User, 1: Employee} */
    private function interviewer(string $name = 'Sara Manager', ?Company $company = null): array
    {
        $company ??= $this->company;
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'name' => $name]);
        $employee = Employee::create([
            'user_id' => $user->id, 'company_id' => $company->id, 'name' => $name, 'email' => $user->email,
            'department_id' => Department::create(['name' => 'Dept ' . $name, 'company_id' => $company->id])->id,
            'designation' => 'Engineer', 'status' => 'active', 'salary' => 1, 'basic_salary' => 1,
        ]);

        return [$user, $employee];
    }

    private function schedule(Candidate $candidate, Employee $interviewer, string $at, array $extra = [])
    {
        return $this->postJson('/api/v1/interviews', array_merge([
            'candidate_id' => $candidate->id, 'interviewer_id' => $interviewer->id, 'scheduled_at' => $at,
            'interview_type' => 'technical', 'duration_minutes' => 60,
        ], $extra));
    }

    public function test_scheduling_with_a_linked_interviewer_fills_the_name_and_notifies_them(): void
    {
        [$user, $employee] = $this->interviewer();
        $candidate = $this->candidate();

        $this->schedule($candidate, $employee, '2026-12-01 10:00:00', ['location' => 'Room 4', 'meeting_link' => 'https://meet.example.com/abc'])
            ->assertCreated()
            ->assertJsonPath('data.interviewer_name', 'Sara Manager')
            ->assertJsonPath('data.status', 'scheduled')
            ->assertJsonPath('data.duration_minutes', 60);

        $notification = NotificationItem::where('user_id', $user->id)->where('type', 'recruitment_interview')->first();
        $this->assertNotNull($notification);
        $this->assertSame('/recruitment/interviews', $notification->link);
    }

    public function test_interviewer_must_be_an_active_employee_of_the_same_company(): void
    {
        $other = Company::create(['name' => 'Other']);
        [, $foreign] = $this->interviewer('Foreign', $other);
        $candidate = $this->candidate();

        $this->schedule($candidate, $foreign, '2026-12-01 10:00:00')->assertStatus(422)->assertJsonValidationErrors('interviewer_id');
        $this->postJson('/api/v1/interviews', ['candidate_id' => $candidate->id, 'scheduled_at' => '2026-12-01 10:00:00'])
            ->assertStatus(422)->assertJsonValidationErrors('interviewer_name');
    }

    public function test_overlapping_interviews_for_the_same_interviewer_or_candidate_are_rejected(): void
    {
        [, $sara] = $this->interviewer();
        [, $omar] = $this->interviewer('Omar');
        $first = $this->candidate('one@example.com');
        $second = $this->candidate('two@example.com');

        $this->schedule($first, $sara, '2026-12-01 10:00:00')->assertCreated();

        $this->schedule($second, $sara, '2026-12-01 10:30:00')
            ->assertStatus(422)->assertJsonValidationErrors('scheduled_at')
            ->assertJsonFragment(['scheduled_at' => ['Sara Manager is already booked from 10:00 to 11:00 (' . $first->full_name . ').']]);
        $this->schedule($first, $omar, '2026-12-01 10:15:00')->assertStatus(422)->assertJsonValidationErrors('scheduled_at');

        // Back-to-back and different people are fine.
        $this->schedule($second, $sara, '2026-12-01 11:00:00')->assertCreated();
        $this->schedule($second, $omar, '2026-12-02 10:00:00')->assertCreated();
    }

    public function test_cancelled_interviews_free_the_slot_and_notify(): void
    {
        [$user, $sara] = $this->interviewer();
        $candidate = $this->candidate();
        $id = $this->schedule($candidate, $sara, '2026-12-01 10:00:00')->assertCreated()->json('data.id');

        $this->postJson("/api/v1/interviews/{$id}/cancel", ['reason' => 'Candidate withdrew'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->postJson("/api/v1/interviews/{$id}/cancel")->assertStatus(422);
        $this->assertSame(1, NotificationItem::where('user_id', $user->id)->where('title', 'like', 'Interview cancelled%')->count());

        $this->schedule($this->candidate('next@example.com'), $sara, '2026-12-01 10:00:00')->assertCreated();
    }

    public function test_rescheduling_checks_conflicts_ignores_itself_and_notifies(): void
    {
        [$user, $sara] = $this->interviewer();
        $a = $this->candidate('a@example.com');
        $b = $this->candidate('b@example.com');
        $first = $this->schedule($a, $sara, '2026-12-01 10:00:00')->assertCreated()->json('data.id');
        $this->schedule($b, $sara, '2026-12-01 12:00:00')->assertCreated();

        $this->putJson("/api/v1/interviews/{$first}", ['scheduled_at' => '2026-12-01 10:15:00'])->assertOk();
        $this->putJson("/api/v1/interviews/{$first}", ['scheduled_at' => '2026-12-01 12:30:00'])->assertStatus(422);
        $this->putJson("/api/v1/interviews/{$first}", ['feedback' => 'Notes only'])->assertOk();

        $this->assertSame(1, NotificationItem::where('user_id', $user->id)->where('title', 'like', 'Interview rescheduled%')->count());
    }

    public function test_interviews_cannot_be_scheduled_for_hired_or_rejected_candidates(): void
    {
        [, $sara] = $this->interviewer();

        $this->schedule($this->candidate('r@example.com', ['stage' => 'rejected']), $sara, '2026-12-01 10:00:00')
            ->assertStatus(422)->assertJsonValidationErrors('candidate_id');
    }

    public function test_interviewer_sees_only_their_own_interviews_with_limited_candidate_data(): void
    {
        [$saraUser, $sara] = $this->interviewer();
        [, $omar] = $this->interviewer('Omar');
        $mine = $this->candidate('mine@example.com', ['notes' => 'PRIVATE RECRUITER NOTE', 'rating' => 5]);
        $theirs = $this->candidate('theirs@example.com');

        $myId = $this->schedule($mine, $sara, '2026-12-01 10:00:00')->assertCreated()->json('data.id');
        $otherId = $this->schedule($theirs, $omar, '2026-12-01 14:00:00')->assertCreated()->json('data.id');

        Sanctum::actingAs($saraUser);
        $list = $this->getJson('/api/v1/interviews')->assertOk()->assertJsonCount(1, 'data.data');
        $list->assertJsonPath('data.data.0.id', $myId)->assertJsonPath('data.data.0.candidate.job_title', 'Backend Engineer');
        $this->assertStringNotContainsString('PRIVATE RECRUITER NOTE', $list->getContent());
        $this->assertArrayNotHasKey('rating', $list->json('data.data.0.candidate'));

        $this->getJson("/api/v1/interviews/{$myId}")->assertOk();
        $this->getJson("/api/v1/interviews/{$otherId}")->assertForbidden();

        // They have no access to recruitment data in general.
        $this->getJson('/api/v1/candidates')->assertForbidden();
        $this->postJson('/api/v1/interviews', ['candidate_id' => $mine->id, 'interviewer_name' => 'x', 'scheduled_at' => '2026-12-05 10:00:00'])->assertForbidden();
        $this->putJson("/api/v1/interviews/{$myId}", ['result' => 'pass'])->assertForbidden();
    }

    public function test_recruiters_can_filter_by_date_range_and_mine(): void
    {
        [, $sara] = $this->interviewer();
        $this->schedule($this->candidate('d1@example.com'), $sara, '2026-12-01 10:00:00')->assertCreated();
        $this->schedule($this->candidate('d2@example.com'), $sara, '2026-12-10 10:00:00')->assertCreated();
        Interview::create(['candidate_id' => $this->candidate('d3@example.com')->id, 'company_id' => $this->company->id, 'interviewer_name' => 'Free text', 'scheduled_at' => '2026-12-03 10:00:00']);

        $this->getJson('/api/v1/interviews?from=2026-12-01&to=2026-12-05')->assertOk()->assertJsonCount(2, 'data.data');
        $this->getJson("/api/v1/interviews?interviewer_id={$sara->id}")->assertOk()->assertJsonCount(2, 'data.data');
        $this->getJson('/api/v1/interviews?mine=1')->assertOk()->assertJsonCount(0, 'data.data');
    }

    public function test_only_the_assigned_interviewer_can_submit_a_scorecard_after_the_interview(): void
    {
        [$saraUser, $sara] = $this->interviewer();
        [$omarUser] = $this->interviewer('Omar');
        $candidate = $this->candidate();

        $future = Interview::create([
            'candidate_id' => $candidate->id, 'company_id' => $this->company->id, 'interviewer_id' => $sara->id,
            'interviewer_name' => 'Sara', 'scheduled_at' => now()->addDay(), 'created_by' => $this->recruiter->id,
        ]);
        $past = Interview::create([
            'candidate_id' => $candidate->id, 'company_id' => $this->company->id, 'interviewer_id' => $sara->id,
            'interviewer_name' => 'Sara', 'scheduled_at' => now()->subHours(3), 'created_by' => $this->recruiter->id,
        ]);
        $payload = ['rating' => 4, 'recommendation' => 'hire', 'strengths' => 'Solid design', 'concerns' => 'Needs mentoring'];

        Sanctum::actingAs($saraUser);
        $this->postJson("/api/v1/interviews/{$future->id}/scorecard", $payload)->assertStatus(422);
        $this->postJson("/api/v1/interviews/{$past->id}/scorecard", [...$payload, 'rating' => 9])->assertStatus(422);
        $this->postJson("/api/v1/interviews/{$past->id}/scorecard", [...$payload, 'recommendation' => 'maybe'])->assertStatus(422);

        Sanctum::actingAs($omarUser);
        $this->postJson("/api/v1/interviews/{$past->id}/scorecard", $payload)->assertForbidden();

        Sanctum::actingAs($this->recruiter);
        $this->postJson("/api/v1/interviews/{$past->id}/scorecard", $payload)->assertForbidden();

        Sanctum::actingAs($saraUser);
        $this->postJson("/api/v1/interviews/{$past->id}/scorecard", $payload)->assertCreated()->assertJsonPath('data.rating', 4);

        $past->refresh();
        $this->assertSame('completed', $past->status);
        $this->assertSame('pass', $past->result);
        $this->assertNotNull(NotificationItem::where('user_id', $this->recruiter->id)->where('type', 'recruitment_scorecard')->first());

        // Resubmitting updates the same scorecard and result.
        $this->postJson("/api/v1/interviews/{$past->id}/scorecard", [...$payload, 'recommendation' => 'no_hire'])->assertCreated();
        $this->assertSame(1, $past->scorecards()->count());
        $this->assertSame('fail', $past->fresh()->result);

        Sanctum::actingAs($this->recruiter);
        $this->getJson("/api/v1/interviews/{$past->id}")->assertOk()->assertJsonPath('data.scorecards.0.recommendation', 'no_hire');
    }

    public function test_reminder_command_nudges_interviewers_once(): void
    {
        [$saraUser, $sara] = $this->interviewer();
        $candidate = $this->candidate();
        Interview::create([
            'candidate_id' => $candidate->id, 'company_id' => $this->company->id, 'interviewer_id' => $sara->id,
            'interviewer_name' => 'Sara', 'scheduled_at' => now()->subHours(3),
        ]);
        Interview::create([
            'candidate_id' => $candidate->id, 'company_id' => $this->company->id, 'interviewer_id' => $sara->id,
            'interviewer_name' => 'Sara', 'scheduled_at' => now()->addDay(),
        ]);

        $this->artisan('recruitment:send-reminders')->assertSuccessful();
        $this->artisan('recruitment:send-reminders')->assertSuccessful();

        $this->assertSame(1, NotificationItem::where('user_id', $saraUser->id)->where('type', 'recruitment_scorecard_due')->count());
    }
}
