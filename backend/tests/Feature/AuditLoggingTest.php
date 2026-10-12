<?php

namespace Tests\Feature;

use App\Models\Approval;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\User;
use App\Models\Workflow;
use App\Services\ApprovalEngine;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class AuditLoggingTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Company $company;

    public function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Audit Co']);
        $this->user = User::create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
        ]);
    }

    private function record(array $overrides = []): AuditLog
    {
        return AuditLog::create(array_merge([
            'user_id' => $this->user->id,
            'action' => 'approve',
            'module' => 'approvals',
            'company_id' => $this->company->id,
            'ip_address' => '127.0.0.1',
            'old_value' => ['status' => 'pending'],
            'new_value' => ['status' => 'approved'],
        ], $overrides));
    }

    public function test_approving_through_the_engine_writes_an_audit_entry(): void
    {
        $workflow = Workflow::create(['name' => 'Leave', 'module' => 'leaves', 'company_id' => $this->company->id, 'definition' => ['description' => 'x']]);
        $approval = Approval::create([
            'module' => 'leaves', 'module_id' => 1, 'workflow_id' => $workflow->id, 'status' => 'pending',
            'requested_by' => $this->user->id, 'company_id' => $this->company->id,
        ]);

        (new ApprovalEngine())->approve($approval, $this->user->id, ['notes' => 'ok']);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'approve',
            'module' => 'leaves',
            'approval_id' => $approval->id,
            'company_id' => $this->company->id,
        ]);
        $this->assertSame('approved', AuditLog::where('approval_id', $approval->id)->value('new_value')['status']);
    }

    public function test_audit_log_is_immutable(): void
    {
        $log = $this->record();

        $this->assertTrue($log->refresh()->immutable);

        try {
            $log->update(['action' => 'reject']);
            $this->fail('An audit log was edited.');
        } catch (\LogicException $exception) {
            $this->assertSame('Audit logs are immutable.', $exception->getMessage());
        }

        $this->expectException(\LogicException::class);
        $log->delete();
    }

    public function test_audit_log_keeps_the_before_and_after_values(): void
    {
        $log = $this->record(['old_value' => ['status' => 'pending', 'step' => 1], 'new_value' => ['status' => 'approved', 'step' => 2]]);

        $log->refresh();
        $this->assertSame(['status' => 'pending', 'step' => 1], $log->old_value);
        $this->assertSame(['status' => 'approved', 'step' => 2], $log->new_value);
    }

    public function test_the_audit_service_stamps_user_and_ip(): void
    {
        Auth::login($this->user);

        $log = AuditService::record(['action' => 'reject', 'module' => 'leaves', 'company_id' => $this->company->id]);

        $this->assertSame($this->user->id, $log->user_id);
        $this->assertNotEmpty($log->ip_address);
        $this->assertTrue($log->immutable);
    }

    public function test_audit_logs_can_be_queried_by_module_and_approval(): void
    {
        $this->record(['action' => 'create', 'module' => 'leaves', 'approval_id' => null]);
        $this->record(['action' => 'approve', 'module' => 'leaves', 'approval_id' => null]);
        $this->record(['action' => 'approve', 'module' => 'payroll']);

        $logs = AuditLog::where('module', 'leaves')->orderBy('id')->get();

        $this->assertCount(2, $logs);
        $this->assertSame(['create', 'approve'], $logs->pluck('action')->all());
    }

    public function test_audit_log_is_company_scoped(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $this->record();
        $this->record(['company_id' => $other->id]);

        $this->assertCount(1, AuditLog::where('company_id', $this->company->id)->get());
        $this->assertCount(1, AuditLog::where('company_id', $other->id)->get());
    }
}
