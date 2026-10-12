<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SettingsTenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_company_admin_can_only_access_branches_for_their_company(): void
    {
        [$companyA, $admin] = $this->createCompanyAdmin('Company A', 'company-a-admin@example.com');
        $companyB = Company::create(['name' => 'Company B']);

        $branchA = Branch::create([
            'company_id' => $companyA->id,
            'name' => 'Company A Branch',
            'code' => 'A-001',
            'is_active' => true,
        ]);
        $branchB = Branch::create([
            'company_id' => $companyB->id,
            'name' => 'Company B Branch',
            'code' => 'B-001',
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/settings/branches')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $branchA->id);

        $this->getJson('/api/v1/settings/branches/' . $branchB->id)
            ->assertForbidden();

        $this->postJson('/api/v1/settings/branches', [
            'company_id' => $companyB->id,
            'name' => 'Cross Company Branch',
            'code' => 'X-999',
            'is_active' => true,
        ])
            ->assertForbidden();

        $this->putJson('/api/v1/settings/branches/' . $branchB->id, [
            'name' => 'Cross Company Branch Updated',
        ])
            ->assertForbidden();

        $this->deleteJson('/api/v1/settings/branches/' . $branchB->id)
            ->assertForbidden();
    }

    public function test_company_admin_can_only_access_their_company_settings(): void
    {
        [$companyA, $admin] = $this->createCompanyAdmin('Company A', 'company-a-settings@example.com');
        $companyB = Company::create(['name' => 'Company B']);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/settings/companies')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $companyA->id);

        $this->getJson('/api/v1/settings/companies/' . $companyB->id)
            ->assertForbidden();

        $this->postJson('/api/v1/settings/companies', [
            'name' => 'Company A Updated',
            'email' => 'updated@example.com',
            'phone' => '123456789',
            'website' => 'https://example.com',
            'address' => 'Updated address',
            'timezone' => 'Asia/Karachi',
            'is_active' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.id', $companyA->id)
            ->assertJsonPath('data.name', 'Company A Updated');

        $this->assertDatabaseCount('companies', 2);
        $this->assertDatabaseHas('companies', [
            'id' => $companyA->id,
            'name' => 'Company A Updated',
        ]);

        $this->putJson('/api/v1/settings/companies/' . $companyB->id, [
            'name' => 'Company B Updated',
        ])
            ->assertForbidden();

        $this->deleteJson('/api/v1/settings/companies/' . $companyB->id)
            ->assertForbidden();
    }

    public function test_company_admin_only_sees_audit_logs_for_their_company(): void
    {
        [$companyA, $admin] = $this->createCompanyAdmin('Company A', 'company-a-logs@example.com');
        $companyB = Company::create(['name' => 'Company B']);

        $userA = User::factory()->create([
            'company_id' => $companyA->id,
            'email' => 'audit-a@example.com',
        ]);
        $userB = User::factory()->create([
            'company_id' => $companyB->id,
            'email' => 'audit-b@example.com',
        ]);

        $logA = AuditLog::create([
            'user_id' => $userA->id,
            'company_id' => $companyA->id,
            'method' => 'GET',
            'module' => 'settings',
            'action' => 'view',
        ]);
        $logB = AuditLog::create([
            'user_id' => $userB->id,
            'company_id' => $companyB->id,
            'method' => 'GET',
            'module' => 'settings',
            'action' => 'view',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/settings/system-logs')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $logA->id);

        $this->getJson('/api/v1/settings/system-logs/' . $logA->id)
            ->assertOk()
            ->assertJsonPath('data.id', $logA->id);

        $this->getJson('/api/v1/settings/system-logs/' . $logB->id)
            ->assertNotFound();
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function createCompanyAdmin(string $companyName, string $email): array
    {
        $company = Company::create(['name' => $companyName]);
        $user = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, [
            'name' => $companyName . ' Admin',
            'email' => $email,
            'company_id' => $company->id,
        ]);

        return [$company, $user];
    }
}
