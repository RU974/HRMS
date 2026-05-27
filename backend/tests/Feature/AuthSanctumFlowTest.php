<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class AuthSanctumFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_login_refresh_and_me_flow(): void
    {
        $register = $this->postJson('/api/auth/register', [
            'name' => 'Flow User',
            'email' => 'flow@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role' => User::ROLE_EMPLOYEE,
        ]);

        $register->assertCreated()->assertJsonPath('success', true)->assertJsonStructure([
            'success',
            'message',
            'data' => ['token', 'user' => ['id', 'email']],
        ]);
        $token = $register->json('data.token');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'flow@example.com');

        $refresh = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/auth/refresh');

        $refresh->assertOk()->assertJsonPath('success', true)->assertJsonStructure([
            'success',
            'message',
            'data' => ['token'],
        ]);
        $newToken = $refresh->json('data.token');
        $this->assertNotSame($token, $newToken);

        $this->withHeader('Authorization', 'Bearer ' . $newToken)
            ->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_forgot_and_reset_password_flow(): void
    {
        $user = User::factory()->create([
            'email' => 'reset-user@example.com',
            'password' => bcrypt('oldPassword123'),
        ]);

        $this->postJson('/api/auth/forgot-password', [
            'email' => $user->email,
        ])->assertOk()->assertJsonPath('success', true);

        $token = Password::broker()->createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk()->assertJsonPath('success', true);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'NewPassword123',
        ])->assertOk()->assertJsonPath('success', true);
    }
}
