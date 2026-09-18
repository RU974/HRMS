<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Department;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrbitChatTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_authentication(): void
    {
        $this->postJson('/api/v1/orbit/chat', ['messages' => [['role' => 'user', 'content' => 'hi']]])
            ->assertUnauthorized();
    }

    public function test_reports_unconfigured_when_api_key_missing(): void
    {
        config(['services.anthropic.key' => null]);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['email' => 'a@acme.test']);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/orbit/chat', ['messages' => [['role' => 'user', 'content' => 'hi']]])
            ->assertStatus(503);
    }

    public function test_rejects_conversation_not_ending_on_user_turn(): void
    {
        config(['services.anthropic.key' => 'test']);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['email' => 'a@acme.test']);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/orbit/chat', ['messages' => [
            ['role' => 'user', 'content' => 'hi'],
            ['role' => 'assistant', 'content' => 'hello'],
        ]])->assertStatus(422);
    }

    public function test_runs_tool_loop_and_returns_reply_with_only_own_tickets_and_allowed_actions(): void
    {
        config(['services.anthropic.key' => 'test']);
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'me@acme.test']);
        $other = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'other@acme.test']);

        foreach ([[$user, 'Mine'], [$other, 'Not mine']] as [$creator, $title]) {
            Ticket::create([
                'company_id' => $company->id, 'created_by' => $creator->id, 'department_id' => $department->id,
                'category' => 'IT', 'priority' => 'low', 'status' => 'open', 'title' => $title, 'description' => 'x',
            ]);
        }

        Http::fake([
            '*' => Http::sequence()
                ->push([
                    'stop_reason' => 'tool_use',
                    'content' => [
                        ['type' => 'tool_use', 'id' => 't1', 'name' => 'get_my_tickets', 'input' => []],
                        ['type' => 'tool_use', 'id' => 't2', 'name' => 'navigate_to', 'input' => ['path' => '/settings', 'label' => 'Bad']],
                        ['type' => 'tool_use', 'id' => 't3', 'name' => 'navigate_to', 'input' => ['path' => '/dashboard', 'label' => 'Open Dashboard']],
                    ],
                ])
                ->push(['stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => 'You have 1 ticket.']]]),
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/v1/orbit/chat', ['messages' => [['role' => 'user', 'content' => 'my tickets?']]])
            ->assertOk()
            ->assertJsonPath('data.reply', 'You have 1 ticket.')
            ->assertJsonCount(1, 'data.actions')
            ->assertJsonPath('data.actions.0.path', '/dashboard');

        Http::assertSent(function ($request) {
            $results = collect($request['messages'] ?? [])->last()['content'] ?? null;

            return is_array($results)
                && str_contains($results[0]['content'] ?? '', 'Mine')
                && !str_contains($results[0]['content'] ?? '', 'Not mine')
                && str_contains($results[1]['content'] ?? '', 'error');
        });
    }
}
