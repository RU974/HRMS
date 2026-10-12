<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuthSanctumFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_login_refresh_and_me_flow(): void
    {
        $register = $this->postJson('/api/v1/auth/register', [
            'name' => 'Flow User',
            'email' => 'flow@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $register->assertCreated()->assertJsonPath('success', true)->assertJsonStructure([
            'success',
            'message',
            'data' => ['token', 'user' => ['id', 'email']],
        ]);
        $token = $register->json('data.token');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.user.email', 'flow@example.com');

        $refresh = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/auth/refresh');

        $refresh->assertOk()->assertJsonPath('success', true)->assertJsonStructure([
            'success',
            'message',
            'data' => ['token'],
        ]);
        $newToken = $refresh->json('data.token');
        $this->assertNotSame($token, $newToken);

        $this->withHeader('Authorization', 'Bearer ' . $newToken)
            ->postJson('/api/v1/auth/logout')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_protected_routes_require_auth_and_only_v1_routes_exist(): void
    {
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        // legacy /api routes should not exist
        $this->getJson('/api/auth/me')->assertStatus(404);
    }

    public function test_register_rejects_role_payloads(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Invalid Role',
            'email' => 'invalid-role@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role' => 'Super Admin',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['role']);
    }

    public function test_forgot_and_reset_password_flow(): void
    {
        $user = User::factory()->create([
            'email' => 'reset-user@example.com',
            'password' => bcrypt('oldPassword123'),
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => $user->email,
        ])->assertOk()->assertJsonPath('success', true);

        $token = Password::broker()->createToken($user);

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk()->assertJsonPath('success', true);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'NewPassword123',
        ])->assertOk()->assertJsonPath('success', true);
    }
}

