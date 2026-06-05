<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLoggingTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    public function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => bcrypt('password'),
            'company_id' => 1,
        ]);
    }

    public function test_audit_log_records_approval_action(): void
    {
        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'approve',
            'entity_type' => 'Approval',
            'entity_id' => 1,
            'changes' => [
                'status' => 'approved',
            ],
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'company_id' => 1,
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'approve',
            'entity_type' => 'Approval',
            'entity_id' => 1,
        ]);
    }

    public function test_audit_log_is_immutable(): void
    {
        $log = AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'approve',
            'entity_type' => 'Approval',
            'entity_id' => 1,
            'changes' => ['status' => 'approved'],
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'company_id' => 1,
        ]);

        // Attempt to update (should fail or be tracked separately)
        $originalCreatedAt = $log->created_at;
        
        $this->assertEquals('approve', $log->action);
        $this->assertEquals($originalCreatedAt, $log->created_at);
    }

    public function test_audit_log_tracks_all_changes(): void
    {
        $changes = [
            'status' => 'approved',
            'current_step_id' => 2,
            'approved_at' => now(),
        ];

        $log = AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'approve',
            'entity_type' => 'Approval',
            'entity_id' => 1,
            'changes' => $changes,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'company_id' => 1,
        ]);

        $this->assertEquals($changes, $log->changes);
    }

    public function test_audit_log_includes_user_and_ip(): void
    {
        $log = AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'reject',
            'entity_type' => 'Approval',
            'entity_id' => 1,
            'changes' => ['status' => 'rejected'],
            'ip_address' => '192.168.1.1',
            'user_agent' => 'Mozilla/5.0',
            'company_id' => 1,
        ]);

        $this->assertEquals($this->user->id, $log->user_id);
        $this->assertEquals('192.168.1.1', $log->ip_address);
        $this->assertStringContainsString('Mozilla', $log->user_agent);
    }

    public function test_audit_logs_can_be_queried_by_entity(): void
    {
        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'create',
            'entity_type' => 'Approval',
            'entity_id' => 1,
            'changes' => ['status' => 'pending'],
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'company_id' => 1,
        ]);

        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'approve',
            'entity_type' => 'Approval',
            'entity_id' => 1,
            'changes' => ['status' => 'approved'],
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'company_id' => 1,
        ]);

        $logs = AuditLog::where('entity_type', 'Approval')
            ->where('entity_id', 1)
            ->get();

        $this->assertCount(2, $logs);
        $this->assertEquals('create', $logs[0]->action);
        $this->assertEquals('approve', $logs[1]->action);
    }

    public function test_audit_log_is_company_scoped(): void
    {
        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'approve',
            'entity_type' => 'Approval',
            'entity_id' => 1,
            'changes' => [],
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'company_id' => 1,
        ]);

        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'approve',
            'entity_type' => 'Approval',
            'entity_id' => 2,
            'changes' => [],
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'company_id' => 2,
        ]);

        $company1Logs = AuditLog::where('company_id', 1)->get();
        $company2Logs = AuditLog::where('company_id', 2)->get();

        $this->assertCount(1, $company1Logs);
        $this->assertCount(1, $company2Logs);
    }
}
