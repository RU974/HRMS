<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SettingsLogsAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_company_admin_can_view_system_logs(): void
    {
        $companyAdmin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN);

        Sanctum::actingAs($companyAdmin);

        $this->getJson('/api/v1/settings/system-logs')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_audit_only_user_cannot_view_system_logs(): void
    {
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        $user->givePermissionTo('view audit logs');

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/settings/system-logs')
            ->assertForbidden();
    }
}
