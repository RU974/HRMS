<?php

namespace Tests\Feature;

use App\Models\Commission;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\License;
use App\Models\TaxBracket;
use App\Models\User;
use App\Services\PayrollCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommissionPayrollTest extends TestCase
{
    use RefreshDatabase;

    private function setUpCompany(): array
    {
        $company = Company::create(['name' => 'Acme Co']);
        License::create([
            'company_id' => $company->id,
            'license_key' => License::generateKey(),
            'product' => 'HRMS',
            'edition' => 'professional',
            'licensee_name' => 'Acme Co',
            'licensee_email' => 'license@acme.test',
            'status' => 'active',
            'activated_at' => now(),
            'is_active' => true,
            'features' => ['payroll'],
        ]);
        $manager = $this->createUserWithRole(User::ROLE_PAYROLL_MANAGER, ['company_id' => $company->id]);
        $department = Department::create(['name' => 'Sales']);
        $user = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'rep@acme.test']);
        $employee = Employee::create([
            'user_id' => $user->id,
            'company_id' => $company->id,
            'name' => 'Sales Rep',
            'email' => 'rep@acme.test',
            'department_id' => $department->id,
            'designation' => 'Rep',
            'salary' => 1000,
            'basic_salary' => 1000,
            'allowances' => 0,
            'commission_percentage' => 5,
            'status' => 'active',
        ]);

        return [$manager, $employee];
    }

    public function test_store_computes_amount_server_side_from_employee_percentage(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        Sanctum::actingAs($manager);

        $this->postJson('/api/v1/commissions', [
            'employee_id' => $employee->id,
            'business_amount' => 20000,
            'effective_date' => '2026-06-15',
            'commission_percentage' => 99, // must be ignored
            'commission_amount' => 1, // must be ignored
        ])->assertCreated();

        $row = Commission::first();
        $this->assertSame('5.00', (string) $row->commission_percentage);
        $this->assertSame('1000.00', (string) $row->commission_amount);
    }

    public function test_store_rejects_employee_without_commission_percentage(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        $employee->update(['commission_percentage' => null]);
        Sanctum::actingAs($manager);

        $this->postJson('/api/v1/commissions', [
            'employee_id' => $employee->id,
            'business_amount' => 20000,
            'effective_date' => '2026-06-15',
        ])->assertStatus(422);

        $this->assertSame(0, Commission::count());
    }

    public function test_payroll_calculator_adds_commission_for_the_month_only(): void
    {
        [, $employee] = $this->setUpCompany();
        TaxBracket::query()->delete();

        Commission::create(['employee_id' => $employee->id, 'business_amount' => 20000, 'commission_percentage' => 5, 'commission_amount' => 1000, 'effective_date' => '2026-06-10']);
        Commission::create(['employee_id' => $employee->id, 'business_amount' => 10000, 'commission_percentage' => 5, 'commission_amount' => 500, 'effective_date' => '2026-06-25']);
        Commission::create(['employee_id' => $employee->id, 'business_amount' => 99999, 'commission_percentage' => 5, 'commission_amount' => 4999.95, 'effective_date' => '2026-07-01']);

        $components = (new PayrollCalculator())->calculateForEmployee($employee, 6, 2026);

        $this->assertSame(1500.0, $components['commission']);
        $this->assertSame(2500.0, $components['gross']);
        $this->assertSame(2500.0, $components['net_salary']);
    }

    public function test_commission_linked_to_payroll_cannot_be_deleted(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        Sanctum::actingAs($manager);

        $payroll = \App\Models\Payroll::create([
            'employee_id' => $employee->id, 'month' => 6, 'year' => 2026, 'base_salary' => 1000,
            'allowances' => 0, 'bonus' => 0, 'commission' => 1000, 'overtime_hours' => 0, 'overtime_pay' => 0,
            'deductions' => 0, 'tax' => 0, 'net_salary' => 2000, 'status' => 'draft',
        ]);
        $linked = Commission::create(['employee_id' => $employee->id, 'payroll_id' => $payroll->id, 'business_amount' => 20000, 'commission_percentage' => 5, 'commission_amount' => 1000, 'effective_date' => '2026-06-10']);
        $free = Commission::create(['employee_id' => $employee->id, 'business_amount' => 100, 'commission_percentage' => 5, 'commission_amount' => 5, 'effective_date' => '2026-06-11']);

        $this->deleteJson("/api/v1/commissions/{$linked->id}")->assertStatus(422);
        $this->deleteJson("/api/v1/commissions/{$free->id}")->assertOk();
    }

    public function test_generate_payroll_job_includes_and_links_commission(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        TaxBracket::query()->delete();
        $commission = Commission::create(['employee_id' => $employee->id, 'business_amount' => 20000, 'commission_percentage' => 5, 'commission_amount' => 1000, 'effective_date' => '2026-06-10']);

        $run = \App\Models\BackgroundRun::create([
            'type' => \App\Models\BackgroundRun::TYPE_PAYROLL_GENERATE,
            'status' => \App\Models\BackgroundRun::STATUS_QUEUED,
            'company_id' => $manager->company_id,
            'requested_by' => $manager->id,
        ]);
        (new \App\Jobs\GeneratePayrollJob($run->id, [$employee->id], 6, 2026))->handle(new PayrollCalculator());

        $payroll = \App\Models\Payroll::where('employee_id', $employee->id)->firstOrFail();
        $this->assertEquals(1000, (float) $payroll->commission);
        $this->assertEquals(2000, (float) $payroll->net_salary);
        $this->assertSame($payroll->id, $commission->fresh()->payroll_id);
    }

    public function test_cross_company_employee_cannot_get_commission_and_is_not_listed(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        $other = Company::create(['name' => 'Other Co']);
        $otherUser = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $other->id, 'email' => 'x@other.test']);
        $otherEmployee = Employee::create([
            'user_id' => $otherUser->id, 'company_id' => $other->id, 'name' => 'Other', 'email' => 'x@other.test',
            'department_id' => $employee->department_id, 'designation' => 'Rep', 'salary' => 1, 'basic_salary' => 1,
            'commission_percentage' => 10, 'status' => 'active',
        ]);
        $foreign = Commission::create(['employee_id' => $otherEmployee->id, 'business_amount' => 100, 'commission_percentage' => 10, 'commission_amount' => 10, 'effective_date' => '2026-06-01']);
        Sanctum::actingAs($manager);

        $this->postJson('/api/v1/commissions', ['employee_id' => $otherEmployee->id, 'business_amount' => 100, 'effective_date' => '2026-06-01'])
            ->assertStatus(403);
        $this->getJson('/api/v1/commissions')->assertOk()->assertJsonCount(0, 'data.data');
        $this->deleteJson("/api/v1/commissions/{$foreign->id}")->assertStatus(403);
        $this->assertSame(1, Commission::count());
    }

    public function test_plain_employee_cannot_list_or_create_commissions(): void
    {
        [, $employee] = $this->setUpCompany();
        Sanctum::actingAs(User::find($employee->user_id));

        $this->getJson('/api/v1/commissions')->assertStatus(403);
        $this->postJson('/api/v1/commissions', ['employee_id' => $employee->id, 'business_amount' => 100, 'effective_date' => '2026-06-01'])
            ->assertStatus(403);
    }

    public function test_store_validates_input(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        Sanctum::actingAs($manager);

        $this->postJson('/api/v1/commissions', ['employee_id' => $employee->id, 'business_amount' => 0, 'effective_date' => '2026-06-01'])->assertStatus(422);
        $this->postJson('/api/v1/commissions', ['employee_id' => $employee->id, 'business_amount' => -5, 'effective_date' => '2026-06-01'])->assertStatus(422);
        $this->postJson('/api/v1/commissions', ['employee_id' => $employee->id, 'business_amount' => 10])->assertStatus(422);
        $this->postJson('/api/v1/commissions', ['business_amount' => 10, 'effective_date' => '2026-06-01'])->assertStatus(422);
    }

    public function test_employee_percentage_can_be_set_validated_and_cleared(): void
    {
        [, $employee] = $this->setUpCompany();
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $employee->company_id]);
        Sanctum::actingAs($admin);

        $this->putJson("/api/v1/employees/{$employee->id}", ['commission_percentage' => 7.5])->assertOk();
        $this->assertEquals(7.5, (float) $employee->fresh()->commission_percentage);

        // The detail-page form sends a blank value as an empty string (form-encoded).
        $this->put("/api/v1/employees/{$employee->id}", ['commission_percentage' => ''], ['Accept' => 'application/json'])->assertOk();
        $this->assertNull($employee->fresh()->commission_percentage);
        $this->putJson("/api/v1/employees/{$employee->id}", ['commission_percentage' => 7.5])->assertOk();

        $this->putJson("/api/v1/employees/{$employee->id}", ['commission_percentage' => 101])->assertStatus(422);
        $this->putJson("/api/v1/employees/{$employee->id}", ['commission_percentage' => -1])->assertStatus(422);

        $this->putJson("/api/v1/employees/{$employee->id}", ['commission_percentage' => null])->assertOk();
        $this->assertNull($employee->fresh()->commission_percentage);
    }

    public function test_net_salary_recomputed_with_commission_on_manual_payroll_edit(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        Sanctum::actingAs($manager);

        $id = $this->postJson('/api/v1/payroll', [
            'employee_id' => $employee->id, 'month' => 6, 'year' => 2026, 'base_salary' => 1000, 'commission' => 250,
        ])->assertCreated()->json('data.id');
        $this->assertEquals(1250, (float) \App\Models\Payroll::find($id)->net_salary);

        $this->putJson("/api/v1/payroll/{$id}", ['commission' => 400, 'deductions' => 100])->assertOk();
        $this->assertEquals(1300, (float) \App\Models\Payroll::find($id)->net_salary);
    }

    public function test_store_refuses_a_month_whose_payroll_already_exists(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        Sanctum::actingAs($manager);
        \App\Models\Payroll::create([
            'employee_id' => $employee->id, 'month' => 6, 'year' => 2026, 'base_salary' => 1000,
            'allowances' => 0, 'bonus' => 0, 'commission' => 0, 'overtime_hours' => 0, 'overtime_pay' => 0,
            'deductions' => 0, 'tax' => 0, 'net_salary' => 1000, 'status' => 'draft',
        ]);

        $this->postJson('/api/v1/commissions', ['employee_id' => $employee->id, 'business_amount' => 100, 'effective_date' => '2026-06-20'])
            ->assertStatus(422);
        $this->assertSame(0, Commission::count());

        $this->postJson('/api/v1/commissions', ['employee_id' => $employee->id, 'business_amount' => 100, 'effective_date' => '2026-07-01'])
            ->assertCreated();
        $this->postJson('/api/v1/commissions', ['employee_id' => $employee->id, 'business_amount' => 10000000000, 'effective_date' => '2026-07-01'])
            ->assertStatus(422);
    }

    public function test_payslip_and_summary_pdfs_render_with_commission(): void
    {
        [$manager, $employee] = $this->setUpCompany();
        $payroll = \App\Models\Payroll::create([
            'employee_id' => $employee->id, 'month' => 6, 'year' => 2026, 'base_salary' => 1000,
            'allowances' => 0, 'bonus' => 0, 'commission' => 500, 'overtime_hours' => 0, 'overtime_pay' => 0,
            'deductions' => 0, 'tax' => 0, 'net_salary' => 1500, 'status' => 'draft',
        ]);
        $slip = \App\Models\Payslip::create([
            'employee_id' => $employee->id, 'payroll_id' => $payroll->id, 'slip_number' => 'PS-1',
            'issue_date' => '2026-06-30', 'status' => 'issued',
        ]);

        foreach (\App\Services\PayslipExportService::PDF_TEMPLATES as $template) {
            $pdf = (new \App\Services\PayslipExportService())->toPdf($slip->load(['employee', 'payroll']), $template);
            $this->assertStringStartsWith('%PDF', $pdf, "template {$template}");
        }

        Sanctum::actingAs($manager);
        $this->get('/api/v1/payroll/summary-pdf?month=6&year=2026')->assertOk();
        $this->getJson('/api/v1/payroll/summary/monthly?month=6&year=2026')->assertOk();
    }
}
