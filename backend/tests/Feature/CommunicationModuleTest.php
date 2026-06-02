<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunicationModuleTest extends TestCase
{
    use RefreshDatabase;

    public function test_company_admin_can_create_announcements(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, [
            'company_id' => $company->id,
            'email' => 'admin@acme.test',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/announcements', [
            'title' => 'Quarterly Update',
            'body' => 'All employees should review the new policy.',
            'target' => 'all',
            'is_published' => true,
        ]);

        $response->assertCreated()->assertJsonPath('success', true);
    }

    public function test_user_can_create_own_notification_without_explicit_recipient(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $company->id,
            'email' => 'employee@acme.test',
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/notifications', [
            'title' => 'Reminder',
            'message' => 'Please complete your profile.',
            'type' => 'info',
            'is_read' => false,
        ]);

        $response->assertCreated()->assertJsonPath('data.user_id', $user->id);

        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Reminder', 'user_id' => $user->id]);
    }

    public function test_user_can_send_chat_message_within_same_company(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $sender = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $company->id,
            'email' => 'sender@acme.test',
        ]);
        $receiver = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $company->id,
            'email' => 'receiver@acme.test',
        ]);

        Sanctum::actingAs($sender);

        $response = $this->postJson('/api/v1/chat-messages', [
            'receiver_id' => $receiver->id,
            'message' => 'Hello team, this is a test message.',
        ]);

        $response->assertCreated()->assertJsonPath('success', true);

        $this->getJson('/api/v1/chat-messages')
            ->assertOk()
            ->assertJsonFragment(['message' => 'Hello team, this is a test message.']);
    }
}
