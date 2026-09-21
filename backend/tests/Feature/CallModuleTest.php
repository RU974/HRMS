<?php

namespace Tests\Feature;

use App\Events\CallEnded;
use App\Events\CallInitiated;
use App\Models\Call;
use App\Models\CallParticipant;
use App\Models\CallSignal;
use App\Models\ChatConversation;
use App\Models\Company;
use App\Models\NotificationItem;
use App\Models\User;
use App\Services\CallService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CallModuleTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company);
    }

    private function employee(string $email, ?Company $company = null): User
    {
        return $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => ($company ?? $this->company)->id,
            'email' => $email,
        ]);
    }

    private function startCall(User $caller, array $calleeIds, string $type = 'audio'): array
    {
        Sanctum::actingAs($caller);

        return $this->postJson('/api/v1/calls', [
            'participant_ids' => $calleeIds,
            'type' => $type,
        ])->assertCreated()->json('data');
    }

    private function answer(User $user, int $callId): void
    {
        Sanctum::actingAs($user);
        $this->postJson("/api/v1/calls/{$callId}/answer")->assertOk();
    }

    public function test_initiating_a_call_rings_invitees_and_makes_caller_host(): void
    {
        Event::fake([CallInitiated::class]);
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');

        $call = $this->startCall($alice, [$bob->id], 'video');

        $this->assertSame('ringing', $call['status']);
        $this->assertSame('direct', $call['call_type']);
        $this->assertSame($alice->id, $call['host_id']);

        $statuses = collect($call['participants'])->pluck('status', 'user_id');
        $this->assertSame('joined', $statuses[$alice->id]);
        $this->assertSame('invited', $statuses[$bob->id]);

        Event::assertDispatched(CallInitiated::class);
    }

    public function test_cannot_call_users_from_another_company(): void
    {
        $other = Company::create(['name' => 'Globex']);
        $this->grantLicense($other);
        $alice = $this->employee('alice@acme.test');
        $mallory = $this->employee('mallory@globex.test', $other);

        Sanctum::actingAs($alice);
        $this->postJson('/api/v1/calls', ['participant_ids' => [$mallory->id], 'type' => 'audio'])
            ->assertStatus(403);
    }

    public function test_user_without_call_permission_cannot_start_a_call(): void
    {
        $noRole = User::factory()->create(['company_id' => $this->company->id, 'email' => 'norole@acme.test']);
        $bob = $this->employee('bob@acme.test');

        Sanctum::actingAs($noRole);
        $this->postJson('/api/v1/calls', ['participant_ids' => [$bob->id], 'type' => 'audio'])
            ->assertStatus(403);
    }

    public function test_call_must_respect_participant_limit(): void
    {
        $alice = $this->employee('alice@acme.test');
        $others = collect(range(1, 4))->map(fn ($i) => $this->employee("p{$i}@acme.test")->id)->all();

        Sanctum::actingAs($alice);
        // limit is 4 people total, i.e. 3 invitees
        $this->postJson('/api/v1/calls', ['participant_ids' => $others, 'type' => 'audio'])
            ->assertStatus(422);
    }

    public function test_busy_users_and_busy_callers_are_rejected(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');

        $this->startCall($alice, [$bob->id]);

        // Carol calls Bob who is already being rung.
        Sanctum::actingAs($carol);
        $this->postJson('/api/v1/calls', ['participant_ids' => [$bob->id], 'type' => 'audio'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This user is currently on another call.');

        // Alice already has a call and cannot start another.
        Sanctum::actingAs($alice);
        $this->postJson('/api/v1/calls', ['participant_ids' => [$carol->id], 'type' => 'audio'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'You already have an active call in progress.');
    }

    public function test_an_active_call_also_makes_the_caller_busy(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');

        $call = $this->startCall($alice, [$bob->id]);
        $this->answer($bob, $call['id']);

        Sanctum::actingAs($alice);
        $this->postJson('/api/v1/calls', ['participant_ids' => [$carol->id], 'type' => 'audio'])
            ->assertStatus(422);
    }

    public function test_answering_activates_the_call(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        $this->answer($bob, $call['id']);

        $fresh = Call::find($call['id']);
        $this->assertSame('active', $fresh->status);
        $this->assertNotNull($fresh->started_at);
    }

    public function test_only_invited_users_can_answer(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $eve = $this->employee('eve@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        Sanctum::actingAs($eve);
        $this->postJson("/api/v1/calls/{$call['id']}/answer")->assertNotFound();
    }

    public function test_declining_a_direct_call_ends_it_as_declined(): void
    {
        Event::fake([CallEnded::class]);
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/calls/{$call['id']}/reject")->assertOk();

        $this->assertSame('declined', Call::find($call['id'])->status);
        Event::assertDispatched(CallEnded::class);
        // A decline is not a missed call.
        $this->assertSame(0, NotificationItem::where('type', 'call_missed')->count());
    }

    public function test_host_cancelling_while_ringing_marks_missed_and_notifies(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();

        $this->assertSame('missed', Call::find($call['id'])->status);
        $this->assertSame(1, NotificationItem::where('type', 'call_missed')->where('user_id', $bob->id)->count());
    }

    public function test_ending_a_direct_call_ends_it_for_both_sides(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);
        $this->answer($bob, $call['id']);

        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();

        $fresh = Call::find($call['id']);
        $this->assertSame('ended', $fresh->status);
        $this->assertSame(0, $fresh->callParticipants()->whereIn('status', ['invited', 'joined'])->count());
    }

    public function test_group_call_continues_when_a_member_leaves_and_hands_off_host(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');
        $call = $this->startCall($alice, [$bob->id, $carol->id]);
        $this->answer($bob, $call['id']);
        $this->answer($carol, $call['id']);

        // A non-host leaves: call goes on, host unchanged.
        Sanctum::actingAs($carol);
        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();
        $fresh = Call::find($call['id']);
        $this->assertSame('active', $fresh->status);
        $this->assertSame($alice->id, $fresh->currentHostId());

        // The host leaves: role passes to Bob and the call goes on.
        // Add Carol back first so two people remain after Alice leaves.
        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/participants", ['user_id' => $carol->id])->assertOk();
        $this->answer($carol, $call['id']);

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();

        $fresh = Call::find($call['id']);
        $this->assertSame('active', $fresh->status);
        $this->assertSame($bob->id, $fresh->currentHostId());

        // Bob is now host and may manage the call.
        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/calls/{$call['id']}/participants/{$carol->id}/mute")->assertOk();

        // The last two leave one by one: call ends when only one person is left.
        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();
        $this->assertSame('ended', Call::find($call['id'])->status);
    }

    public function test_only_the_host_can_add_remove_or_mute_participants(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');
        $call = $this->startCall($alice, [$bob->id]);
        $this->answer($bob, $call['id']);

        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/calls/{$call['id']}/participants", ['user_id' => $carol->id])->assertStatus(403);
        $this->postJson("/api/v1/calls/{$call['id']}/participants/{$alice->id}/mute")->assertStatus(403);
        $this->deleteJson("/api/v1/calls/{$call['id']}/participants/{$alice->id}")->assertStatus(403);
    }

    public function test_adding_a_participant_respects_the_limit(): void
    {
        $alice = $this->employee('alice@acme.test');
        $invitees = collect(range(1, 3))->map(fn ($i) => $this->employee("p{$i}@acme.test"));
        $extra = $this->employee('extra@acme.test');

        $call = $this->startCall($alice, $invitees->pluck('id')->all());

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/participants", ['user_id' => $extra->id])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This call has reached its participant limit.');
    }

    public function test_signals_only_flow_between_joined_participants(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $eve = $this->employee('eve@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        $offer = ['type' => 'offer', 'sdp' => 'v=0...'];

        // Bob has not answered yet, so he is not a valid signalling target.
        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/signals", ['to_user_id' => $bob->id, 'type' => 'offer', 'payload' => $offer])
            ->assertStatus(403);

        $this->answer($bob, $call['id']);

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/signals", ['to_user_id' => $bob->id, 'type' => 'offer', 'payload' => $offer])
            ->assertCreated();
        $this->postJson("/api/v1/calls/{$call['id']}/signals", [
            'to_user_id' => $bob->id,
            'type' => 'ice-candidate',
            'payload' => ['candidate' => 'candidate:1 1 UDP 1 1.2.3.4 5000 typ host', 'sdpMid' => '0', 'sdpMLineIndex' => 0],
        ])->assertCreated();

        // Extra keys survive intact.
        $this->assertSame('0', CallSignal::where('type', 'ice-candidate')->first()->payload['sdpMid']);

        // Outsiders and self-signals are refused.
        $this->postJson("/api/v1/calls/{$call['id']}/signals", ['to_user_id' => $eve->id, 'type' => 'offer', 'payload' => $offer])->assertStatus(403);
        $this->postJson("/api/v1/calls/{$call['id']}/signals", ['to_user_id' => $alice->id, 'type' => 'offer', 'payload' => $offer])->assertStatus(403);

        // Malformed and oversized payloads are refused.
        $this->postJson("/api/v1/calls/{$call['id']}/signals", ['to_user_id' => $bob->id, 'type' => 'offer', 'payload' => ['type' => 'offer']])->assertStatus(422);
        $this->postJson("/api/v1/calls/{$call['id']}/signals", [
            'to_user_id' => $bob->id,
            'type' => 'offer',
            'payload' => ['type' => 'offer', 'sdp' => str_repeat('a', 70000)],
        ])->assertStatus(422);
    }

    public function test_signals_are_deleted_when_the_call_ends(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);
        $this->answer($bob, $call['id']);

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/signals", [
            'to_user_id' => $bob->id, 'type' => 'offer', 'payload' => ['type' => 'offer', 'sdp' => 'x'],
        ])->assertCreated();
        $this->assertSame(1, CallSignal::count());

        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();
        $this->assertSame(0, CallSignal::count());
    }

    public function test_heartbeat_refreshes_liveness_and_reports_call_state(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);
        $this->answer($bob, $call['id']);

        CallParticipant::where('call_id', $call['id'])->update(['last_heartbeat_at' => now()->subMinutes(10)]);

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/heartbeat")
            ->assertOk()
            ->assertJsonPath('data.call_status', 'active')
            ->assertJsonPath('data.participant_status', 'joined');

        $this->assertTrue(
            CallParticipant::where('call_id', $call['id'])->where('user_id', $alice->id)->first()->last_heartbeat_at->gt(now()->subMinute())
        );
    }

    public function test_expire_command_drops_disconnected_participants_and_ends_empty_calls(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);
        $this->answer($bob, $call['id']);

        // Bob keeps heartbeating, Alice's client vanished.
        CallParticipant::where('call_id', $call['id'])->where('user_id', $alice->id)
            ->update(['last_heartbeat_at' => now()->subMinutes(5)]);
        CallParticipant::where('call_id', $call['id'])->where('user_id', $bob->id)
            ->update(['last_heartbeat_at' => now()]);

        $this->artisan('calls:expire-stale')->assertSuccessful();

        // Direct call, one side gone: nobody left to talk to.
        $this->assertSame('ended', Call::find($call['id'])->status);
    }

    public function test_expire_command_marks_unanswered_calls_missed(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        Call::whereKey($call['id'])->update(['created_at' => now()->subMinutes(5)]);
        CallParticipant::where('call_id', $call['id'])->update(['last_heartbeat_at' => now()]);

        app(CallService::class)->expireStale();

        $this->assertSame('missed', Call::find($call['id'])->status);
        $this->assertSame(1, NotificationItem::where('type', 'call_missed')->where('user_id', $bob->id)->count());
    }

    public function test_calls_of_other_companies_are_invisible(): void
    {
        $other = Company::create(['name' => 'Globex']);
        $this->grantLicense($other);
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $mallory = $this->employee('mallory@globex.test', $other);
        $call = $this->startCall($alice, [$bob->id]);

        Sanctum::actingAs($mallory);
        $this->getJson("/api/v1/calls/{$call['id']}")->assertNotFound();
        $this->postJson("/api/v1/calls/{$call['id']}/answer")->assertNotFound();
    }

    public function test_call_history_lists_declined_calls(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/calls/{$call['id']}/reject")->assertOk();

        $this->getJson('/api/v1/calls/history')
            ->assertOk()
            ->assertJsonPath('data.data.0.status', 'declined');
    }

    public function test_linked_conversation_must_include_all_participants(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');

        $conversation = ChatConversation::create([
            'type' => 'direct', 'company_id' => $this->company->id, 'created_by' => $alice->id,
        ]);
        $conversation->participants()->attach([$alice->id, $bob->id]);

        Sanctum::actingAs($alice);
        $this->postJson('/api/v1/calls', [
            'conversation_id' => $conversation->id, 'participant_ids' => [$carol->id], 'type' => 'audio',
        ])->assertStatus(422);

        Sanctum::actingAs($carol);
        $this->postJson('/api/v1/calls', [
            'conversation_id' => $conversation->id, 'participant_ids' => [$bob->id], 'type' => 'audio',
        ])->assertStatus(403);
    }

    public function test_call_config_issues_short_lived_turn_credentials(): void
    {
        config([
            'calls.ice.turn_urls' => ['turn:turn.example.com:3478'],
            'calls.ice.turn_secret' => 'shared-secret',
            'calls.ice.turn_ttl_seconds' => 600,
        ]);
        $alice = $this->employee('alice@acme.test');

        Sanctum::actingAs($alice);
        $servers = $this->getJson('/api/v1/calls/config')->assertOk()->json('data.ice_servers');

        $turn = collect($servers)->firstWhere('username');
        $this->assertNotNull($turn);
        [$expires, $userId] = explode(':', $turn['username']);
        $this->assertSame((string) $alice->id, $userId);
        $this->assertGreaterThan(time(), (int) $expires);
        $this->assertLessThanOrEqual(time() + 600, (int) $expires);
        $this->assertSame(
            base64_encode(hash_hmac('sha1', $turn['username'], 'shared-secret', true)),
            $turn['credential']
        );
    }

    public function test_current_call_lets_a_reloaded_client_recover_an_incoming_ring(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        Sanctum::actingAs($bob);
        $current = $this->getJson('/api/v1/calls/current')->assertOk()->json('data');
        $this->assertSame($call['id'], $current['id']);
        $this->assertSame('invited', collect($current['participants'])->firstWhere('user_id', $bob->id)['status']);

        // Someone uninvolved has no current call.
        Sanctum::actingAs($carol);
        $this->getJson('/api/v1/calls/current')->assertOk()->assertJsonPath('data', null);

        // Once the call is over it is no longer "current".
        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();
        $this->getJson('/api/v1/calls/current')->assertOk()->assertJsonPath('data', null);
    }

    public function test_any_authenticated_request_records_presence(): void
    {
        $alice = $this->employee('alice@acme.test');
        $this->assertNull($alice->last_seen_at);

        Sanctum::actingAs($alice);
        $this->postJson('/api/v1/presence/ping')->assertOk();

        $this->assertNotNull($alice->fresh()->last_seen_at);
    }

    public function test_call_end_event_says_why_the_call_closed(): void
    {
        Event::fake([CallEnded::class]);
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $call = $this->startCall($alice, [$bob->id]);

        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/calls/{$call['id']}/reject")->assertOk();

        Event::assertDispatched(CallEnded::class, fn (CallEnded $e) => $e->broadcastWith()['reason'] === 'declined');
    }

    public function test_people_without_call_access_cannot_be_rung(): void
    {
        $alice = $this->employee('alice@acme.test');
        $noRole = User::factory()->create(['company_id' => $this->company->id, 'email' => 'norole@acme.test']);

        Sanctum::actingAs($alice);
        $this->postJson('/api/v1/calls', ['participant_ids' => [$noRole->id], 'type' => 'audio'])
            ->assertStatus(422);

        $this->assertSame(0, Call::count());
    }

    public function test_a_late_invitation_that_goes_unanswered_lapses_without_ending_the_call(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');
        $call = $this->startCall($alice, [$bob->id]);
        $this->answer($bob, $call['id']);

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/calls/{$call['id']}/participants", ['user_id' => $carol->id])->assertOk();

        $this->travel(2)->minutes();
        // The people actually on the call are still heartbeating; carol never answers.
        CallParticipant::where('call_id', $call['id'])->where('status', 'joined')->update(['last_heartbeat_at' => now()]);

        $this->artisan('calls:expire-stale')->assertSuccessful();

        $this->assertSame('active', Call::find($call['id'])->status);
        $this->assertSame('rejected', CallParticipant::where('call_id', $call['id'])->where('user_id', $carol->id)->value('status'));
        $this->assertSame(1, NotificationItem::where('type', 'call_missed')->where('user_id', $carol->id)->count());

        // Carol is free to take other calls again.
        $this->assertSame([], app(CallService::class)->busyUserIds([$carol->id]));
    }

    public function test_starting_a_call_clears_dead_calls_that_would_make_someone_look_busy(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');

        // Alice rings Bob and gives up without the scheduler ever running.
        $first = $this->startCall($alice, [$bob->id]);
        $this->travel(2)->minutes();

        $second = $this->startCall($carol, [$bob->id]);

        $this->assertSame('missed', Call::find($first['id'])->status);
        $this->assertSame('ringing', Call::find($second['id'])->status);
    }
}
