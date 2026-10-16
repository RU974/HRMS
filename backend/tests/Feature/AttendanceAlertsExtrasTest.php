<?php

namespace Tests\Feature;

use App\Events\NotificationCreated;
use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\BiometricDevice;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\NotificationItem;
use App\Models\User;
use App\Services\AttendanceNotificationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceAlertsExtrasTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Department $dept;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Acme HR']);
        $this->dept = Department::create(['name' => 'Ops', 'company_id' => $this->company->id]);
    }

    private function employee(string $name, ?Employee $manager = null, ?Department $dept = null): Employee
    {
        $user = User::factory()->create(['company_id' => $this->company->id]);

        return Employee::create([
            'user_id' => $user->id,
            'company_id' => $this->company->id,
            'name' => $name,
            'email' => strtolower($name) . '@example.com',
            'department_id' => ($dept ?? $this->dept)->id,
            'designation' => 'Staff',
            'salary' => 1000,
            'status' => 'active',
            'manager_id' => $manager?->id,
        ]);
    }

    private function types(User $user): array
    {
        return NotificationItem::where('user_id', $user->id)->pluck('type')->all();
    }

    private function absent(Employee $emp): void
    {
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-14', 'status' => 'absent']);
    }

    private function runExceptions(): void
    {
        app(AttendanceNotificationService::class)->dailyExceptions(Carbon::parse('2026-09-01'), Carbon::parse('2026-09-30'));
    }

    // ── Department head ────────────────────────────────────────────────

    public function test_manager_and_department_head_are_both_told(): void
    {
        $head = $this->employee('Head');
        $manager = $this->employee('Boss');
        $this->dept->update(['head_employee_id' => $head->id]);
        $emp = $this->employee('Ali', $manager);
        $this->absent($emp);

        $this->runExceptions();

        $this->assertSame(['attendance_absent_team'], $this->types($manager->user));
        $this->assertSame(['attendance_absent_team'], $this->types($head->user));
    }

    public function test_one_person_who_is_both_manager_and_head_is_told_once(): void
    {
        $boss = $this->employee('Boss');
        $this->dept->update(['head_employee_id' => $boss->id]);
        $emp = $this->employee('Ali', $boss);
        $this->absent($emp);

        $this->runExceptions();

        $this->assertSame(['attendance_absent_team'], $this->types($boss->user));
    }

    public function test_head_alone_is_enough_and_the_employee_who_heads_their_own_department_is_not_told_twice(): void
    {
        $head = $this->employee('Head');
        $this->dept->update(['head_employee_id' => $head->id]);
        $hr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $emp = $this->employee('Ali'); // no manager
        $this->absent($emp);
        Attendance::create(['employee_id' => $head->id, 'date' => '2026-09-14', 'status' => 'absent']);

        $this->runExceptions();

        // The head hears about Ali (team) and about their own absence.
        $this->assertEqualsCanonicalizing(['attendance_absent_team', 'attendance_absent'], $this->types($head->user));
        // Nobody left to tell for the head themself (no manager, they are the head): HR steps in.
        $this->assertContains('attendance_absent_team', $this->types($hr));
    }

    public function test_department_api_sets_and_validates_the_head(): void
    {
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        $this->grantLicense($this->company, ['attendance']);
        $head = $this->employee('Head');
        $other = Company::create(['name' => 'Other Co']);
        $foreignUser = User::factory()->create(['company_id' => $other->id]);
        $foreign = Employee::create([
            'user_id' => $foreignUser->id, 'company_id' => $other->id, 'name' => 'Foreign', 'email' => 'f@example.com',
            'department_id' => Department::create(['name' => 'X', 'company_id' => $other->id])->id,
            'designation' => 'Staff', 'salary' => 1, 'status' => 'active',
        ]);
        Sanctum::actingAs($admin);

        $this->putJson("/api/v1/departments/{$this->dept->id}", ['name' => 'Ops', 'head_employee_id' => $head->id])
            ->assertOk();
        $this->assertSame($head->id, $this->dept->fresh()->head_employee_id);

        $this->getJson('/api/v1/departments')->assertOk()->assertJsonPath('data.0.head.name', 'Head');

        $this->putJson("/api/v1/departments/{$this->dept->id}", ['name' => 'Ops', 'head_employee_id' => $foreign->id])
            ->assertStatus(422)->assertJsonValidationErrors('head_employee_id');

        $this->putJson("/api/v1/departments/{$this->dept->id}", ['name' => 'Ops', 'head_employee_id' => null])->assertOk();
        $this->assertNull($this->dept->fresh()->head_employee_id);
    }

    // ── Half days caused by lateness ───────────────────────────────────

    public function test_late_caused_half_days_count_as_lates_but_short_day_half_days_do_not(): void
    {
        AttendancePolicy::create([
            'company_id' => $this->company->id, 'name' => 'p', 'late_after_time' => '09:15:00',
            'half_day_after_late_minutes' => 60, 'late_alert_threshold' => 3,
        ]);
        $manager = $this->employee('Boss');
        $emp = $this->employee('Cy', $manager);
        $short = $this->employee('Di', $manager);

        // Cy: 1 plain late + 2 half days from arriving after 10:15 -> 3 lates.
        Attendance::create(['employee_id' => $emp->id, 'date' => '2026-09-01', 'check_in' => '2026-09-01 09:30:00', 'status' => 'late']);
        foreach (['2026-09-02', '2026-09-03'] as $d) {
            Attendance::create(['employee_id' => $emp->id, 'date' => $d, 'check_in' => "$d 11:00:00", 'check_out' => "$d 18:00:00", 'status' => 'half_day', 'status_reason' => 'policy']);
        }
        // Di: 3 half days that were NOT late (short hours) -> not lates.
        foreach (['2026-09-01', '2026-09-02', '2026-09-03'] as $d) {
            Attendance::create(['employee_id' => $short->id, 'date' => $d, 'check_in' => "$d 09:00:00", 'check_out' => "$d 11:00:00", 'status' => 'half_day', 'status_reason' => 'policy']);
        }

        app(AttendanceNotificationService::class)->repeatedLates(Carbon::parse('2026-09-10'));

        $this->assertSame(['attendance_repeated_late'], $this->types($emp->user));
        $this->assertSame([], $this->types($short->user));
    }

    // ── Email ──────────────────────────────────────────────────────────

    private function mailed(): array
    {
        return app('mail.manager')->mailer('array')->getSymfonyTransport()->messages()->all();
    }

    public function test_email_goes_out_only_when_the_company_turned_it_on(): void
    {
        config(['mail.default' => 'array']);
        $manager = $this->employee('Boss');
        $emp = $this->employee('Ali', $manager);
        $this->absent($emp);

        $this->runExceptions();
        $this->assertCount(0, $this->mailed(), 'email is off by default');

        NotificationItem::query()->delete();
        AttendancePolicy::create(['company_id' => $this->company->id, 'name' => 'p', 'late_after_time' => '09:15:00', 'alerts_email' => true]);
        app(\App\Services\AttendancePolicyResolver::class)->forget();

        $this->runExceptions();
        $to = collect($this->mailed())->map(fn ($m) => $m->getOriginalMessage()->getTo()[0]->getAddress())->all();
        $this->assertEqualsCanonicalizing([$manager->user->email, $emp->user->email], $to);
        $this->assertCount(2, $this->mailed());
        $body = quoted_printable_decode($this->mailed()[0]->getOriginalMessage()->getBody()->bodyToString());
        $this->assertStringContainsString('/attendance?date=2026-09-14', $body);
        $this->assertStringNotContainsString('You was', $body);

        $this->runExceptions(); // already told: no second email
        $this->assertCount(2, $this->mailed());
    }

    public function test_a_failing_mailer_never_breaks_the_notification(): void
    {
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => '127.0.0.1', 'mail.mailers.smtp.port' => 1, 'mail.mailers.smtp.timeout' => 1]);
        AttendancePolicy::create(['company_id' => $this->company->id, 'name' => 'p', 'late_after_time' => '09:15:00', 'alerts_email' => true]);
        $emp = $this->employee('Ali');
        $this->absent($emp);

        $this->runExceptions();

        $this->assertSame(['attendance_absent'], $this->types($emp->user));
    }

    // ── Live push ──────────────────────────────────────────────────────

    public function test_creating_a_notification_pushes_it_to_the_recipient_channel(): void
    {
        Event::fake([NotificationCreated::class]);
        $user = User::factory()->create(['company_id' => $this->company->id]);

        $item = NotificationItem::create(['company_id' => $this->company->id, 'user_id' => $user->id, 'type' => 't', 'title' => 'Hello', 'message' => 'm', 'link' => '/attendance', 'is_read' => false]);

        Event::assertDispatched(NotificationCreated::class, function (NotificationCreated $e) use ($user, $item) {
            return $e->broadcastOn()[0]->name === 'private-notifications.user.' . $user->id
                && $e->broadcastAs() === 'notification.created'
                && $e->broadcastWith() === ['id' => $item->id, 'type' => 't', 'title' => 'Hello', 'link' => '/attendance'];
        });
    }

    public function test_a_broken_websocket_server_never_stops_a_notification_from_saving(): void
    {
        Event::listen(NotificationCreated::class, fn () => throw new \RuntimeException('reverb is down'));
        $user = User::factory()->create(['company_id' => $this->company->id]);

        NotificationItem::create(['company_id' => $this->company->id, 'user_id' => $user->id, 'type' => 't', 'title' => 'x', 'message' => 'm', 'is_read' => false]);

        $this->assertSame(1, NotificationItem::where('user_id', $user->id)->count());
    }

    public function test_only_the_owner_can_join_their_notification_channel(): void
    {
        $owner = User::factory()->create(['company_id' => $this->company->id]);
        $other = User::factory()->create(['company_id' => $this->company->id]);

        $channels = app(\Illuminate\Contracts\Broadcasting\Broadcaster::class);
        $callback = collect(\Illuminate\Support\Facades\Broadcast::getChannels() ?? [])->get('notifications.user.{userId}');
        $this->assertNotNull($callback, 'channel is registered');
        $this->assertTrue((bool) $callback($owner, $owner->id));
        $this->assertFalse((bool) $callback($other, $owner->id));
    }

    // ── Real agent push -> recovery ────────────────────────────────────

    public function test_an_agent_push_ends_the_silence_and_the_recovery_is_announced(): void
    {
        config(['services.biometric_agent.secret' => 'agent-secret']);
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        $device = new BiometricDevice([
            'name' => 'Gate', 'connection_type' => 'tcp', 'ip_address' => '10.0.0.9', 'port' => 4370,
            'sync_mode' => 'scheduled', 'sync_interval_minutes' => 15, 'timezone' => 'UTC', 'status' => 'online',
            'last_sync_at' => now()->subHours(8),
        ]);
        $device->company_id = $this->company->id;
        $device->save();

        $this->artisan('biometric:check-stale')->assertSuccessful();
        $this->assertSame(['biometric_device_stale'], $this->types($admin));

        // The agent comes back and pushes (even punches nobody is mapped to count as a sign of life).
        $this->postJson('/api/v1/auth/biometric-agent/push', [
            'device_id' => $device->id,
            'punches' => [['device_user_id' => '999', 'timestamp' => now()->format('Y-m-d H:i:s'), 'type' => 'in']],
        ], ['Authorization' => 'Bearer agent-secret'])->assertSuccessful();

        $this->assertTrue($device->fresh()->last_sync_at->gt(now()->subMinute()));
        $this->artisan('biometric:check-stale')->assertSuccessful();

        $this->assertSame(['biometric_device_stale', 'biometric_device_recovered'], $this->types($admin));
        $this->assertNull($device->fresh()->stale_alerted_at);
    }
}
