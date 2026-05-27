<?php

namespace Tests\Feature;

use App\Models\Bonus;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BonusCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_payroll_manager_can_reassign_a_bonus_to_another_employee(): void
    {
        $manager = User::factory()->create();
        $managerRole = Role::create([
            'company_id' => null,
            'name' => User::ROLE_PAYROLL_MANAGER,
            'description' => 'Payroll manager',
            'is_system' => true,
        ]);
        $manager->rolesRelation()->attach($managerRole->id);

        $department = Department::create(['name' => 'Finance']);

        $employeeOne = Employee::create([
            'user_id' => User::factory()->create()->id,
            'name' => 'Bonus Employee One',
            'email' => 'bonus.one@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1200,
            'status' => 'active',
        ]);

        $employeeTwo = Employee::create([
            'user_id' => User::factory()->create()->id,
            'name' => 'Bonus Employee Two',
            'email' => 'bonus.two@example.com',
            'department_id' => $department->id,
            'designation' => 'Analyst',
            'salary' => 1300,
            'status' => 'active',
        ]);

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

        $this->putJson("/api/bonuses/{$bonus->id}", [
            'employee_id' => $employeeTwo->id,
            'title' => 'Quarterly Incentive Updated',
            'amount' => 300,
            'taxable' => false,
            'notes' => 'Updated note',
        ])
            ->assertOk()
            ->assertJsonPath('data.employee_id', $employeeTwo->id)
            ->assertJsonPath('data.title', 'Quarterly Incentive Updated')
            ->assertJsonPath('data.amount', 300)
            ->assertJsonPath('data.taxable', false)
            ->assertJsonPath('data.notes', 'Updated note');
    }
}
