<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Bonus;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayrollListPaginationTest extends TestCase
{
    use RefreshDatabase;

    private function seedPayrolls(int $count): User
    {
        $company = Company::create(['name' => 'Acme Co']);
        $this->grantLicense($company, ['payroll']);
        $manager = $this->createUserWithRole(User::ROLE_PAYROLL_MANAGER, ['company_id' => $company->id]);
        $department = Department::create(['name' => 'Finance']);

        for ($i = 1; $i <= $count; $i++) {
            $employee = Employee::create([
                'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id])->id,
                'company_id' => $company->id,
                'name' => sprintf('Person %02d', $i),
                'email' => "person{$i}@example.com",
                'employee_number' => sprintf('E-%03d', $i),
                'department_id' => $department->id,
                'designation' => 'Analyst',
                'salary' => 1000 + $i,
                'status' => 'active',
            ]);

            Payroll::create([
                'employee_id' => $employee->id,
                'month' => '10',
                'year' => 2026,
                'base_salary' => 1000 + $i,
                'bonus' => 0,
                'deductions' => 0,
                'tax' => 0,
                'net_salary' => 1000 + $i,
                'status' => 'draft',
            ]);
        }

        return $manager;
    }

    public function test_list_pages_cover_every_record_without_overlap(): void
    {
        Sanctum::actingAs($this->seedPayrolls(50));

        $ids = [];
        foreach ([1, 2, 3] as $page) {
            $res = $this->getJson("/api/v1/payroll?per_page=20&page={$page}")->assertOk();
            $res->assertJsonPath('data.total', 50)->assertJsonPath('data.last_page', 3);
            $ids = array_merge($ids, collect($res->json('data.data'))->pluck('id')->all());
        }

        $this->assertCount(50, $ids);
        $this->assertCount(50, array_unique($ids));
    }

    public function test_per_page_is_capped_and_validated(): void
    {
        Sanctum::actingAs($this->seedPayrolls(3));

        $this->getJson('/api/v1/payroll?per_page=100000')->assertStatus(422);
        $this->getJson('/api/v1/payroll?sort_by=password')->assertStatus(422);
        $this->getJson('/api/v1/payroll')->assertOk()->assertJsonPath('data.per_page', 15);
    }

    public function test_sorting_is_applied_across_pages_not_just_within_one(): void
    {
        Sanctum::actingAs($this->seedPayrolls(30));

        $second = $this->getJson('/api/v1/payroll?per_page=10&page=2&sort_by=employee&sort_dir=asc')->assertOk();
        $names = collect($second->json('data.data'))->pluck('employee.name')->all();

        $this->assertSame('Person 11', $names[0]);
        $this->assertSame('Person 20', $names[9]);

        $top = $this->getJson('/api/v1/payroll?per_page=1&sort_by=net_salary&sort_dir=desc')->assertOk();
        $this->assertEquals(1030, $top->json('data.data.0.net_salary'));
    }

    public function test_search_matches_name_or_employee_number(): void
    {
        Sanctum::actingAs($this->seedPayrolls(30));

        $this->getJson('/api/v1/payroll?search=Person 07')->assertOk()->assertJsonPath('data.total', 1);
        $this->getJson('/api/v1/payroll?search=E-02')->assertOk()->assertJsonPath('data.total', 10);
        $this->getJson('/api/v1/payroll?search=%25')->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_related_payroll_lists_honour_per_page_and_clamp_it(): void
    {
        $manager = $this->seedPayrolls(20);
        Sanctum::actingAs($manager);

        foreach (Employee::all() as $employee) {
            Bonus::create(['employee_id' => $employee->id, 'title' => 'Spot', 'amount' => 100, 'taxable' => false, 'effective_date' => '2026-10-05']);
        }

        // Default page size is unchanged...
        $this->getJson('/api/v1/bonuses')->assertOk()->assertJsonCount(15, 'data.data')->assertJsonPath('data.total', 20);
        // ...but a client can ask for everything in one go,
        $this->getJson('/api/v1/bonuses?per_page=200')->assertOk()->assertJsonCount(20, 'data.data');
        // and an absurd size is clamped rather than loading the whole table.
        $this->getJson('/api/v1/bonuses?per_page=100000')->assertOk()->assertJsonPath('data.per_page', 200);
        $this->getJson('/api/v1/bonuses?per_page=0')->assertOk()->assertJsonPath('data.per_page', 15);
    }
}
