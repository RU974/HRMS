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

    public function test_super_admin_broadcasts_notifications_to_all_users(): void
    {
        $companyA = Company::create(['name' => 'Acme HR']);
        $companyB = Company::create(['name' => 'Globex HR']);
        $superAdmin = $this->createUserWithRole(User::ROLE_SUPER_ADMIN, [
            'email' => 'superadmin@hrms.test',
        ]);
        $employeeA = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $companyA->id,
            'email' => 'employee-a@acme.test',
        ]);
        $employeeB = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $companyB->id,
            'email' => 'employee-b@globex.test',
        ]);

        Sanctum::actingAs($superAdmin);

        $response = $this->postJson('/api/v1/notifications', [
            'title' => 'Global Notice',
            'message' => 'HRMS maintenance will start at 10 PM.',
            'type' => 'info',
            'is_read' => false,
        ]);

        $response->assertCreated()->assertJsonPath('success', true);

        $this->assertDatabaseCount('notifications', 3);
        $this->assertDatabaseHas('notifications', [
            'title' => 'Global Notice',
            'user_id' => $superAdmin->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'title' => 'Global Notice',
            'user_id' => $employeeA->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'title' => 'Global Notice',
            'user_id' => $employeeB->id,
        ]);

        Sanctum::actingAs($employeeA);
        $this->getJson('/api/v1/notifications?read=false')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Global Notice', 'user_id' => $employeeA->id]);

        Sanctum::actingAs($employeeB);
        $this->getJson('/api/v1/notifications?read=false')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Global Notice', 'user_id' => $employeeB->id]);
    }

    public function test_super_admin_announcement_creates_bell_notifications_for_all_users(): void
    {
        $companyA = Company::create(['name' => 'Acme HR']);
        $companyB = Company::create(['name' => 'Globex HR']);
        $superAdmin = $this->createUserWithRole(User::ROLE_SUPER_ADMIN, [
            'email' => 'superadmin@hrms.test',
        ]);
        $hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, [
            'company_id' => $companyA->id,
            'email' => 'hr@acme.test',
        ]);
        $employeeA = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $companyA->id,
            'email' => 'employee-a@acme.test',
        ]);
        $employeeB = $this->createUserWithRole(User::ROLE_EMPLOYEE, [
            'company_id' => $companyB->id,
            'email' => 'employee-b@globex.test',
        ]);

        Sanctum::actingAs($superAdmin);

        $response = $this->postJson('/api/v1/announcements', [
            'title' => 'Policy Update',
            'body' => 'Please review the updated leave policy.',
            'target' => 'all',
            'is_published' => true,
        ]);

        

        $response->assertCreated()->assertJsonPath('success', true);

        $this->assertDatabaseCount('notifications', 4);
        $this->assertDatabaseHas('notifications', [
            'title' => 'Policy Update',
            'user_id' => $superAdmin->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'title' => 'Policy Update',
            'user_id' => $hrManager->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'title' => 'Policy Update',
            'user_id' => $employeeA->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'title' => 'Policy Update',
            'user_id' => $employeeB->id,
        ]);

        Sanctum::actingAs($hrManager);
        $this->getJson('/api/v1/notifications?read=false')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Policy Update', 'user_id' => $hrManager->id]);

        Sanctum::actingAs($employeeB);
        $this->getJson('/api/v1/notifications?read=false')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Policy Update', 'user_id' => $employeeB->id]);
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

        $conversation = $this->postJson('/api/v1/chat-conversations', [
            'type' => 'direct',
            'participant_ids' => [$receiver->id],
        ])->assertCreated()->json('data');

        $response = $this->postJson('/api/v1/chat-messages', [
            'conversation_id' => $conversation['id'],
            'message' => 'Hello team, this is a test message.',
        ]);

        $response->assertCreated()->assertJsonPath('success', true);

        $this->getJson('/api/v1/chat-messages')
            ->assertOk()
            ->assertJsonFragment(['message' => 'Hello team, this is a test message.']);
    }
}
