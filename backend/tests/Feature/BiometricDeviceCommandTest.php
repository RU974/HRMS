<?php

namespace Tests\Feature;

use App\Models\BiometricDevice;
use App\Models\BiometricDeviceUser;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDeviceMapping;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiometricDeviceCommandTest extends TestCase
{
    use RefreshDatabase;

    private function setUpDevice(): array
    {
        config(['services.biometric_agent.secret' => 'agent-secret']);

        $company = Company::create(['name' => 'Bio Co']);
        $this->grantLicense($company, ['attendance']);
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $company->id]);

        $device = new BiometricDevice([
            'name' => 'Front door', 'connection_type' => 'tcp', 'ip_address' => '192.168.1.50',
            'port' => 4370, 'sync_mode' => 'scheduled', 'timezone' => 'UTC', 'status' => 'online',
        ]);
        $device->company_id = $company->id;
        $device->save();

        $employee = Employee::create([
            'user_id' => User::factory()->create(['company_id' => $company->id])->id,
            'name' => 'Ayesha Khan', 'email' => 'ayesha@example.com',
            'department_id' => Department::firstOrCreate(['name' => 'Ops'])->id,
            'designation' => 'Analyst', 'salary' => 1000, 'status' => 'active',
        ]);
        $employee->forceFill(['company_id' => $company->id])->save();

        return [$admin, $device, $employee];
    }

    private function agent(): array
    {
        return ['Authorization' => 'Bearer agent-secret'];
    }

    public function test_add_user_is_queued_then_applied_by_agent_and_mapped(): void
    {
        [$admin, $device, $employee] = $this->setUpDevice();
        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/biometric-devices/{$device->id}/device-users", [
            'device_user_id' => '105', 'employee_id' => $employee->id,
        ])->assertCreated()->assertJsonPath('data.status', 'pending');

        // Duplicate while waiting is refused
        $this->postJson("/api/v1/biometric-devices/{$device->id}/device-users", ['device_user_id' => '105', 'name' => 'X'])
            ->assertStatus(422);

        $poll = $this->withHeaders($this->agent())
            ->postJson('/api/v1/auth/biometric-agent/commands', ['device_ip' => '192.168.1.50', 'device_port' => 4370])
            ->assertOk()
            ->assertJsonPath('commands.0.type', 'add_user')
            ->assertJsonPath('commands.0.name', 'Ayesha Khan');
        $commandId = $poll->json('commands.0.id');

        // Handed out once: not offered again straight away
        $this->withHeaders($this->agent())
            ->postJson('/api/v1/auth/biometric-agent/commands', ['device_ip' => '192.168.1.50', 'device_port' => 4370])
            ->assertJsonCount(0, 'commands');

        $this->withHeaders($this->agent())
            ->postJson("/api/v1/auth/biometric-agent/commands/{$commandId}/result", [
                'device_ip' => '192.168.1.50', 'device_port' => 4370, 'success' => true,
            ])->assertOk()->assertJsonPath('status', 'done');

        $this->assertDatabaseHas('biometric_device_users', ['device_id' => $device->id, 'device_user_id' => '105']);
        $this->assertDatabaseHas('employee_device_mappings', [
            'device_id' => $device->id, 'employee_id' => $employee->id, 'device_user_id' => '105',
        ]);
    }

    public function test_remove_user_clears_device_user_and_mapping_only_after_agent_confirms(): void
    {
        [$admin, $device, $employee] = $this->setUpDevice();
        BiometricDeviceUser::create(['device_id' => $device->id, 'device_user_id' => '7', 'name' => 'Ayesha', 'company_id' => $device->company_id]);
        EmployeeDeviceMapping::create(['employee_id' => $employee->id, 'device_id' => $device->id, 'device_user_id' => '7', 'company_id' => $device->company_id]);
        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/biometric-devices/{$device->id}/device-users/7")->assertCreated();
        $this->assertDatabaseHas('biometric_device_users', ['device_user_id' => '7']);

        $commandId = $this->withHeaders($this->agent())
            ->postJson('/api/v1/auth/biometric-agent/commands', ['device_ip' => '192.168.1.50', 'device_port' => 4370])
            ->json('commands.0.id');

        $this->withHeaders($this->agent())
            ->postJson("/api/v1/auth/biometric-agent/commands/{$commandId}/result", [
                'device_ip' => '192.168.1.50', 'device_port' => 4370, 'success' => true,
            ])->assertOk();

        $this->assertDatabaseMissing('biometric_device_users', ['device_user_id' => '7']);
        $this->assertDatabaseMissing('employee_device_mappings', ['device_user_id' => '7']);
    }

    public function test_failed_command_changes_nothing_and_agent_needs_the_secret(): void
    {
        [$admin, $device] = $this->setUpDevice();
        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/biometric-devices/{$device->id}/device-users", ['device_user_id' => '9', 'name' => 'Bob'])->assertCreated();
        $commandId = $this->withHeaders($this->agent())
            ->postJson('/api/v1/auth/biometric-agent/commands', ['device_ip' => '192.168.1.50', 'device_port' => 4370])
            ->json('commands.0.id');

        $this->withHeaders($this->agent())
            ->postJson("/api/v1/auth/biometric-agent/commands/{$commandId}/result", [
                'device_ip' => '192.168.1.50', 'device_port' => 4370, 'success' => false, 'message' => 'boom',
            ])->assertOk()->assertJsonPath('status', 'failed');

        $this->assertDatabaseMissing('biometric_device_users', ['device_user_id' => '9']);

        $this->withHeaders(['Authorization' => 'Bearer wrong'])
            ->postJson('/api/v1/auth/biometric-agent/commands', ['device_ip' => '192.168.1.50'])->assertStatus(401);
    }
}
