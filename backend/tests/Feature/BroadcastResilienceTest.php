<?php

namespace Tests\Feature;

use App\Broadcasting\ResilientPusherBroadcaster;
use App\Models\ChatMessage;
use App\Models\Call;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Realtime is an enhancement. If Reverb is down, saving a message, creating a
 * conversation or starting a call must still succeed instead of returning a
 * 500 ("Pusher error: cURL error 7: Failed to connect").
 */
class BroadcastResilienceTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    protected function setUp(): void
    {
        parent::setUp();

        // Point the real Reverb driver at a port nothing listens on.
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
            'broadcasting.connections.reverb.options.host' => '127.0.0.1',
            'broadcasting.connections.reverb.options.port' => 1,
            'broadcasting.connections.reverb.options.scheme' => 'http',
            'broadcasting.connections.reverb.options.useTLS' => false,
        ]);
        Cache::forget(ResilientPusherBroadcaster::BREAKER_KEY);

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company);
    }

    private function employee(string $email): User
    {
        return $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $this->company->id,
            'email' => $email,
        ]);
    }

    public function test_the_overridden_driver_is_the_resilient_one(): void
    {
        $this->assertInstanceOf(ResilientPusherBroadcaster::class, app(\Illuminate\Contracts\Broadcasting\Factory::class)->connection('reverb'));
    }

    public function test_starting_a_chat_and_sending_a_message_succeed_while_reverb_is_down(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        Sanctum::actingAs($alice);

        $conversation = $this->postJson('/api/v1/chat-conversations', [
            'type' => 'direct',
            'participant_ids' => [$bob->id],
        ])->assertCreated()->json('data');

        $this->postJson('/api/v1/chat-messages', [
            'conversation_id' => $conversation['id'],
            'message' => 'still delivered to the database',
        ])->assertCreated();

        $this->assertSame(1, ChatMessage::where('message', 'still delivered to the database')->count());
    }

    public function test_starting_and_ending_a_call_succeed_while_reverb_is_down(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        Sanctum::actingAs($alice);

        $call = $this->postJson('/api/v1/calls', ['participant_ids' => [$bob->id], 'type' => 'audio'])
            ->assertCreated()->json('data');

        $this->postJson("/api/v1/calls/{$call['id']}/end")->assertOk();

        $this->assertSame('missed', Call::find($call['id'])->status);
    }

    public function test_a_failure_is_logged_and_opens_the_circuit_breaker(): void
    {
        Log::spy();
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        Sanctum::actingAs($alice);

        $this->assertFalse(Cache::has(ResilientPusherBroadcaster::BREAKER_KEY));

        $this->postJson('/api/v1/chat-conversations', [
            'type' => 'direct',
            'participant_ids' => [$bob->id],
        ])->assertCreated();

        Log::shouldHaveReceived('warning')->withArgs(
            fn ($message) => str_contains((string) $message, 'Realtime broadcast failed')
        )->atLeast()->once();
        $this->assertTrue(Cache::has(ResilientPusherBroadcaster::BREAKER_KEY), 'breaker should open after a failure');
    }

    public function test_while_the_breaker_is_open_broadcasts_are_skipped_without_touching_the_network(): void
    {
        Cache::put(ResilientPusherBroadcaster::BREAKER_KEY, true, 60);
        Log::spy();

        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        Sanctum::actingAs($alice);

        $this->postJson('/api/v1/chat-conversations', [
            'type' => 'direct',
            'participant_ids' => [$bob->id],
        ])->assertCreated();

        // No attempt was made, so nothing new was logged.
        Log::shouldNotHaveReceived('warning');
    }

    public function test_an_event_reverb_rejects_is_dropped_without_tripping_the_breaker(): void
    {
        Log::spy();

        $pusher = \Mockery::mock(\Pusher\Pusher::class);
        $pusher->shouldReceive('trigger')->once()->andThrow(new \Pusher\ApiErrorException('Payload too large.', 413));

        $broadcaster = new ResilientPusherBroadcaster($pusher);
        $broadcaster->broadcast(['private-chat.1'], 'chat.message.sent', ['message' => str_repeat('x', 20)]);

        $this->assertFalse(Cache::has(ResilientPusherBroadcaster::BREAKER_KEY), 'a 413 must not silence unrelated events');
        Log::shouldHaveReceived('error')->once();
    }

    public function test_a_connection_error_opens_the_breaker(): void
    {
        Log::spy();

        $pusher = \Mockery::mock(\Pusher\Pusher::class);
        $pusher->shouldReceive('trigger')->once()->andThrow(new \Pusher\ApiErrorException('cURL error 7: Failed to connect'));

        (new ResilientPusherBroadcaster($pusher))->broadcast(['private-call.1'], 'call.signal', []);

        $this->assertTrue(Cache::has(ResilientPusherBroadcaster::BREAKER_KEY));
    }
}
