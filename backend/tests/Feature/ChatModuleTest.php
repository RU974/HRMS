<?php

namespace Tests\Feature;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChatModuleTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    protected function setUp(): void
    {
        parent::setUp();

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

    private function conversation(string $type, User $creator, array $others, ?string $name = null): ChatConversation
    {
        $conversation = ChatConversation::create([
            'type' => $type,
            'name' => $name,
            'company_id' => $this->company->id,
            'created_by' => $creator->id,
        ]);
        $conversation->participants()->attach(array_merge([$creator->id], array_map(fn ($u) => $u->id, $others)));

        return $conversation;
    }

    private function say(User $user, ChatConversation $conversation, string $text): int
    {
        Sanctum::actingAs($user);

        return $this->postJson('/api/v1/chat-messages', [
            'conversation_id' => $conversation->id,
            'message' => $text,
        ])->assertCreated()->json('data.id');
    }

    public function test_thread_is_cursor_paginated_newest_first_page_then_older(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $conversation = $this->conversation('direct', $alice, [$bob]);

        foreach (range(1, 5) as $i) {
            $this->say($alice, $conversation, "message {$i}");
        }

        $page1 = $this->getJson("/api/v1/chat-messages?conversation_id={$conversation->id}&limit=2")
            ->assertOk()
            ->assertJsonPath('data.has_more', true)
            ->json('data');

        // Ascending order within the page, but the *newest* two messages.
        $this->assertSame(['message 4', 'message 5'], array_column($page1['data'], 'message'));

        $before = $page1['data'][0]['id'];
        $page2 = $this->getJson("/api/v1/chat-messages?conversation_id={$conversation->id}&limit=2&before_id={$before}")
            ->assertOk()->json('data');
        $this->assertSame(['message 2', 'message 3'], array_column($page2['data'], 'message'));
        $this->assertTrue($page2['has_more']);

        $before = $page2['data'][0]['id'];
        $page3 = $this->getJson("/api/v1/chat-messages?conversation_id={$conversation->id}&limit=2&before_id={$before}")
            ->assertOk()->json('data');
        $this->assertSame(['message 1'], array_column($page3['data'], 'message'));
        $this->assertFalse($page3['has_more']);
    }

    public function test_only_conversation_members_can_post_or_read(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $eve = $this->employee('eve@acme.test');
        $conversation = $this->conversation('direct', $alice, [$bob]);
        $this->say($alice, $conversation, 'secret plans');

        Sanctum::actingAs($eve);
        $this->postJson('/api/v1/chat-messages', ['conversation_id' => $conversation->id, 'message' => 'hi'])
            ->assertStatus(403);
        $this->getJson("/api/v1/chat-messages?conversation_id={$conversation->id}")->assertStatus(403);
    }

    public function test_employees_with_chat_view_cannot_read_other_peoples_messages(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $eve = $this->employee('eve@acme.test');
        $conversation = $this->conversation('direct', $alice, [$bob]);
        $messageId = $this->say($alice, $conversation, 'private message');

        Sanctum::actingAs($eve);

        // Not through the list, by id, or as an attachment.
        $this->getJson('/api/v1/chat-messages')->assertOk()->assertJsonMissing(['message' => 'private message']);
        $this->getJson("/api/v1/chat-messages/{$messageId}")->assertStatus(403);
        $this->getJson("/api/v1/chat-messages/{$messageId}/attachment")->assertStatus(403);
    }

    public function test_chat_admins_can_moderate_company_conversations(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, [
            'company_id' => $this->company->id, 'email' => 'admin@acme.test',
        ]);
        $conversation = $this->conversation('direct', $alice, [$bob]);
        $messageId = $this->say($alice, $conversation, 'audit me');

        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/chat-messages/{$messageId}")->assertOk();
        // ...but an admin who is not a member still cannot speak in it.
        $this->postJson('/api/v1/chat-messages', ['conversation_id' => $conversation->id, 'message' => 'boo'])
            ->assertStatus(403);
    }

    public function test_deleting_a_message_leaves_a_blank_placeholder_and_removes_the_attachment(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $conversation = $this->conversation('direct', $alice, [$bob]);

        Sanctum::actingAs($alice);
        $response = $this->post('/api/v1/chat-messages', [
            'conversation_id' => $conversation->id,
            'message' => 'see attached',
            'file' => UploadedFile::fake()->image('photo.jpg'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $path = $response->json('data.attachment_path');
        $id = $response->json('data.id');
        // Stored privately, not on the public disk.
        Storage::disk('local')->assertExists($path);
        Storage::disk('public')->assertMissing($path);

        // Bob (a member) can download; a non-member cannot.
        Sanctum::actingAs($bob);
        $this->get("/api/v1/chat-messages/{$id}/attachment")->assertOk();

        Sanctum::actingAs($alice);
        $this->deleteJson("/api/v1/chat-messages/{$id}")->assertOk();
        Storage::disk('local')->assertMissing($path);

        $thread = $this->getJson("/api/v1/chat-messages?conversation_id={$conversation->id}")->assertOk()->json('data.data');
        $this->assertCount(1, $thread);
        $this->assertSame('', $thread[0]['message']);
        $this->assertNull($thread[0]['attachment_path']);
        $this->assertNotNull($thread[0]['deleted_at']);
    }

    public function test_secure_attachments_command_moves_public_files_to_the_private_disk(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $conversation = $this->conversation('direct', $alice, [$bob]);

        // A legacy attachment that lives on the public disk.
        Storage::disk('public')->put('chat-attachments/legacy.pdf', 'legacy-bytes');
        $message = ChatMessage::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $alice->id,
            'receiver_id' => $bob->id,
            'message' => 'old file',
            'attachment_path' => 'chat-attachments/legacy.pdf',
            'attachment_name' => 'legacy.pdf',
            'company_id' => $this->company->id,
        ]);

        // A dry run changes nothing.
        $this->artisan('chat:secure-attachments', ['--dry-run' => true])->assertSuccessful();
        Storage::disk('public')->assertExists('chat-attachments/legacy.pdf');
        Storage::disk('local')->assertMissing('chat-attachments/legacy.pdf');

        $this->artisan('chat:secure-attachments')->assertSuccessful();
        Storage::disk('local')->assertExists('chat-attachments/legacy.pdf');
        Storage::disk('public')->assertMissing('chat-attachments/legacy.pdf');

        // Still downloadable by a member through the authorised endpoint, and the bytes survived.
        Sanctum::actingAs($bob);
        $this->get("/api/v1/chat-messages/{$message->id}/attachment")->assertOk();
        $this->assertSame('legacy-bytes', Storage::disk('local')->get('chat-attachments/legacy.pdf'));

        // Running again is harmless.
        $this->artisan('chat:secure-attachments')->assertSuccessful();
        Storage::disk('local')->assertExists('chat-attachments/legacy.pdf');
    }

    public function test_editing_marks_the_message_as_edited(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $conversation = $this->conversation('direct', $alice, [$bob]);
        $id = $this->say($alice, $conversation, 'original');

        $this->putJson("/api/v1/chat-messages/{$id}", ['message' => 'changed'])
            ->assertOk()
            ->assertJsonPath('data.message', 'changed');
        $this->assertNotNull(ChatMessage::find($id)->edited_at);

        // Only the sender may edit.
        Sanctum::actingAs($bob);
        $this->putJson("/api/v1/chat-messages/{$id}", ['message' => 'hijack'])->assertStatus(403);
    }

    public function test_group_messages_have_no_fake_receiver(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');
        $group = $this->conversation('group', $alice, [$bob, $carol], 'Team');
        $id = $this->say($alice, $group, 'hello team');

        $this->assertNull(ChatMessage::find($id)->receiver_id);
    }

    public function test_only_group_admins_can_rename_and_change_members(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');
        $dave = $this->employee('dave@acme.test');
        $group = $this->conversation('group', $alice, [$bob, $carol], 'Team');

        // A plain member cannot manage the group.
        Sanctum::actingAs($bob);
        $this->putJson("/api/v1/chat-conversations/{$group->id}", ['name' => 'Renamed'])->assertStatus(403);
        $this->postJson("/api/v1/chat-conversations/{$group->id}/participants", ['user_id' => $dave->id])->assertStatus(403);
        $this->deleteJson("/api/v1/chat-conversations/{$group->id}/participants/{$carol->id}")->assertStatus(403);

        // The creator can.
        Sanctum::actingAs($alice);
        $this->putJson("/api/v1/chat-conversations/{$group->id}", ['name' => 'Renamed'])->assertOk();
        $this->postJson("/api/v1/chat-conversations/{$group->id}/participants", ['user_id' => $dave->id])->assertOk();
        $this->deleteJson("/api/v1/chat-conversations/{$group->id}/participants/{$carol->id}")->assertOk();

        $group->refresh();
        $this->assertSame('Renamed', $group->name);
        $this->assertEqualsCanonicalizing(
            [$alice->id, $bob->id, $dave->id],
            $group->participants()->pluck('users.id')->all()
        );

        // A removed member loses access.
        Sanctum::actingAs($carol);
        $this->getJson("/api/v1/chat-messages?conversation_id={$group->id}")->assertStatus(403);
    }

    public function test_leaving_a_group_transfers_ownership(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');
        $group = $this->conversation('group', $alice, [$bob, $carol], 'Team');

        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/chat-conversations/{$group->id}/leave")->assertOk();

        $group->refresh();
        $this->assertNotSame($alice->id, $group->created_by);
        $this->assertNotNull($group->created_by);
        $this->assertFalse($group->participants()->where('users.id', $alice->id)->exists());

        // Direct conversations cannot be left.
        $direct = $this->conversation('direct', $bob, [$carol]);
        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/chat-conversations/{$direct->id}/leave")->assertStatus(422);
    }

    public function test_group_requires_a_name_and_conversation_list_reports_manage_rights(): void
    {
        $alice = $this->employee('alice@acme.test');
        $bob = $this->employee('bob@acme.test');
        $carol = $this->employee('carol@acme.test');

        Sanctum::actingAs($alice);
        $this->postJson('/api/v1/chat-conversations', [
            'type' => 'group', 'name' => '   ', 'participant_ids' => [$bob->id, $carol->id],
        ])->assertStatus(422);

        $this->postJson('/api/v1/chat-conversations', [
            'type' => 'group', 'name' => 'Ops', 'participant_ids' => [$bob->id, $carol->id],
        ])->assertCreated();

        $list = $this->getJson('/api/v1/chat-conversations')->assertOk()->json('data');
        $this->assertTrue($list[0]['can_manage']);

        Sanctum::actingAs($bob);
        $list = $this->getJson('/api/v1/chat-conversations')->assertOk()->json('data');
        $this->assertFalse($list[0]['can_manage']);
    }
}
