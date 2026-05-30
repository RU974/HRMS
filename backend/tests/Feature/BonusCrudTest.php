<?php

namespace Tests\Feature;

use App\Models\Bonus;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BonusCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_payroll_manager_can_create_list_show_update_and_delete_bonus(): void
    {
        [$manager, $employee] = $this->createPayrollManagerAndEmployee();
        $payroll = Payroll::create([
            'employee_id' => $employee->id,
            'month' => 5,
            'year' => 2026,
            'base_salary' => 1200,
            'bonus' => 0,
            'deductions' => 0,
            'tax' => 0,
            'net_salary' => 1200,
            'payment_date' => '2026-05-31',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($manager);

        $createResponse = $this->postJson('/api/v1/bonuses', [
            'employee_id' => $employee->id,
            'payroll_id' => $payroll->id,
            'title' => 'Quarterly Incentive',
            'amount' => 250.50,
            'taxable' => true,
            'effective_date' => '2026-05-15',
            'notes' => 'Approved by finance',
        ])
            ->assertCreated()
            ->assertJsonPath('data.employee_id', $employee->id)
            ->assertJsonPath('data.payroll_id', $payroll->id)
            ->assertJsonPath('data.title', 'Quarterly Incentive')
            ->assertJsonPath('data.taxable', true);

        $bonusId = $createResponse->json('data.id');

        $this->getJson('/api/v1/bonuses')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $bonusId);

        $this->getJson("/api/v1/bonuses/{$bonusId}")
            ->assertOk()
            ->assertJsonPath('data.id', $bonusId)
            ->assertJsonPath('data.employee.id', $employee->id);

        $this->putJson("/api/v1/bonuses/{$bonusId}", [
            'title' => 'Quarterly Incentive Updated',
            'amount' => 300,
            'taxable' => false,
            'notes' => null,
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Quarterly Incentive Updated')
            ->assertJsonPath('data.taxable', false)
            ->assertJsonPath('data.notes', null);

        $this->deleteJson("/api/v1/bonuses/{$bonusId}")
            ->assertOk()
            ->assertJsonPath('message', 'Bonus deleted successfully');

        $this->assertDatabaseMissing('bonuses', ['id' => $bonusId]);
    }

    public function test_bonus_payroll_must_belong_to_selected_employee(): void
    {
        [$manager, $employeeOne] = $this->createPayrollManagerAndEmployee();
        $employeeTwo = $this->createEmployee('Bonus Employee Two', 'bonus.two@example.com');
        $payroll = Payroll::create([
            'employee_id' => $employeeOne->id,
            'month' => 5,
            'year' => 2026,
            'base_salary' => 1200,
            'bonus' => 0,
            'deductions' => 0,
            'tax' => 0,
            'net_salary' => 1200,
            'payment_date' => '2026-05-31',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($manager);

        $this->postJson('/api/v1/bonuses', [
            'employee_id' => $employeeTwo->id,
            'payroll_id' => $payroll->id,
            'title' => 'Mismatch Bonus',
            'amount' => 100,
            'effective_date' => '2026-05-15',
        ])
            ->assertStatus(422);
    }

    public function test_payroll_manager_can_reassign_a_bonus_to_another_employee(): void
    {
        [$manager, $employeeOne] = $this->createPayrollManagerAndEmployee();
        $employeeTwo = $this->createEmployee('Bonus Employee Two', 'bonus.two@example.com');

        $bonus = Bonus::create([
            'employee_id' => $employeeOne->id,
            'payroll_id' => null,
            'title' => 'Quarterly Incentive',
            'amount' => 250,
            'taxable' => true,
            'effective_date' => '2026-05-15',
            'notes' => 'Initial note',
        ]);

        Sanctum::actingAs($manager);

        $this->putJson("/api/v1/bonuses/{$bonus->id}", [
            'employee_id' => $employeeTwo->id,
            'title' => 'Quarterly Incentive Updated',
            'amount' => 300,
            'taxable' => false,
            'notes' => 'Updated note',
        ])
            ->assertOk()
            ->assertJsonPath('data.employee_id', $employeeTwo->id)
            ->assertJsonPath('data.title', 'Quarterly Incentive Updated')
            ->assertJsonPath('data.amount', '300.00')
            ->assertJsonPath('data.taxable', false)
            ->assertJsonPath('data.notes', 'Updated note');
    }

    private function createPayrollManagerAndEmployee(): array
    {
        $manager = $this->createUserWithRole(User::ROLE_PAYROLL_MANAGER);

        return [$manager, $this->createEmployee('Bonus Employee One', 'bonus.one@example.com')];
    }

    private function createEmployee(string $name, string $email): Employee
    {
        $department = Department::firstOrCreate(['name' => 'Finance']);

        return Employee::create([
            'user_id' => User::factory()->create()->id,
            'name' => $name,
            'email' => $email,
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);
    }
}


