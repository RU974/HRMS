<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SearchTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private function seedTwoCompanies(): void
    {
        $c1 = Company::create(['name' => 'Alpha Co']);
        $c2 = Company::create(['name' => 'Beta Co']);
        $this->grantLicense($c1);

        $this->admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $c1->id, 'name' => 'Zed Admin']);
        $other = User::factory()->create(['company_id' => $c2->id, 'name' => 'Zed Other']);
        $d1 = Department::create(['name' => 'Zed Dept', 'company_id' => $c1->id]);
        $d2 = Department::create(['name' => 'Zed Dept Other', 'company_id' => $c2->id]);
        $d3 = Department::create(['name' => 'Ops Dept', 'company_id' => $c1->id]);

        Employee::create(['user_id' => $this->admin->id, 'company_id' => $c1->id, 'name' => 'Zed Admin', 'email' => 'zed@a.test', 'department_id' => $d1->id, 'employee_number' => 'E1', 'designation' => 'Dev']);
        Employee::create(['user_id' => $other->id, 'company_id' => $c2->id, 'name' => 'Zed Other', 'email' => 'zed@b.test', 'department_id' => $d2->id, 'employee_number' => 'E2', 'designation' => 'Dev']);
        Employee::create(['user_id' => User::factory()->create(['company_id' => $c1->id])->id, 'company_id' => $c1->id, 'name' => 'Quinn Plain', 'email' => 'quinn@a.test', 'department_id' => $d3->id, 'employee_number' => 'E3', 'designation' => 'Ops']);

        Holiday::create(['name' => 'Zed Day', 'holiday_date' => '2026-12-25', 'company_id' => $c1->id]);
        Holiday::create(['name' => 'Zed Day Other', 'holiday_date' => '2026-12-25', 'company_id' => $c2->id]);
    }

    public function test_employee_list_filters_by_search_within_own_company(): void
    {
        $this->seedTwoCompanies();
        Sanctum::actingAs($this->admin);

        $names = collect($this->getJson('/api/v1/employees?search=Zed')->assertOk()->json('data.data'))->pluck('name')->all();
        $this->assertSame(['Zed Admin'], $names);

        $names = collect($this->getJson('/api/v1/employees?search=E3')->assertOk()->json('data.data'))->pluck('name')->all();
        $this->assertSame(['Quinn Plain'], $names);

        $this->getJson('/api/v1/employees?search=nomatchxyz')->assertOk()->assertJsonCount(0, 'data.data');
    }

    public function test_global_search_is_company_scoped_and_formats_results(): void
    {
        $this->seedTwoCompanies();
        Sanctum::actingAs($this->admin);

        $categories = collect($this->getJson('/api/v1/search?q=Zed')->assertOk()->json('data.categories'))->keyBy('key');

        $this->assertSame(['Zed Admin'], collect($categories['employees']['items'])->pluck('title')->all());
        $this->assertSame('/employees?search=Zed%20Admin', $categories['employees']['items'][0]['path']);
        $this->assertStringContainsString('E1 • Zed Dept', $categories['employees']['items'][0]['detail']);
        $this->assertSame(['Zed Dept'], collect($categories['departments']['items'])->pluck('title')->all());
        $this->assertSame(['Zed Day'], collect($categories['holidays']['items'])->pluck('title')->all());
    }
}
