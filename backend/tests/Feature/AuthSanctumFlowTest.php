<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

        $register->assertCreated()->assertJsonStructure(['token', 'user' => ['id', 'email']]);
        $token = $register->json('token');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('email', 'flow@example.com');

        $refresh = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/auth/refresh');

        $refresh->assertOk()->assertJsonStructure(['token']);
        $newToken = $refresh->json('token');
        $this->assertNotSame($token, $newToken);

        $this->withHeader('Authorization', 'Bearer ' . $newToken)
            ->postJson('/api/auth/logout')
            ->assertOk();
    }
}
