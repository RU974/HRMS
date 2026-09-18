<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TicketAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployee(User $user, Department $department, string $name): Employee
    {
        return Employee::create([
            'user_id'       => $user->id,
            'name'          => $name,
            'email'         => strtolower(str_replace(' ', '.', $name)) . '@example.com',
            'department_id' => $department->id,
            'designation'   => 'Staff',
            'salary'        => 1000,
            'status'        => 'active',
        ]);
    }

    private function makeTicket(Company $company, Department $department, User $creator, array $overrides = []): Ticket
    {
        return Ticket::create(array_merge([
            'company_id'    => $company->id,
            'created_by'    => $creator->id,
            'department_id' => $department->id,
            'category'      => 'IT',
            'priority'      => 'medium',
            'status'        => 'open',
            'title'         => 'Laptop not turning on',
            'description'   => 'My laptop will not power on this morning.',
        ], $overrides));
    }

    public function test_creator_can_view_own_ticket(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $employee = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);

        $ticket = $this->makeTicket($company, $department, $employee);

        Sanctum::actingAs($employee);

        $this->getJson("/api/v1/tickets/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $ticket->id);
    }

    public function test_unrelated_employee_cannot_view_someone_elses_ticket(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $stranger = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'stranger@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($stranger);

        $this->getJson("/api/v1/tickets/{$ticket->id}")->assertForbidden();
    }

    public function test_department_manager_can_view_ticket_in_own_department(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $manager = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $company->id, 'email' => 'manager@acme.test']);
        $this->makeEmployee($manager, $department, 'Dept Manager');

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($manager);

        $this->getJson("/api/v1/tickets/{$ticket->id}")->assertOk();
    }

    public function test_department_manager_cannot_view_ticket_in_other_department(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $itDept = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $salesDept = Department::create(['name' => 'Sales', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $manager = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $company->id, 'email' => 'manager@acme.test']);
        $this->makeEmployee($manager, $salesDept, 'Sales Manager');

        $ticket = $this->makeTicket($company, $itDept, $creator);

        Sanctum::actingAs($manager);

        $this->getJson("/api/v1/tickets/{$ticket->id}")->assertForbidden();
    }

    public function test_department_manager_cannot_reassign_ticket_outside_own_department(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $itDept = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $salesDept = Department::create(['name' => 'Sales', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $manager = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $company->id, 'email' => 'manager@acme.test']);
        $this->makeEmployee($manager, $salesDept, 'Sales Manager');
        $itAgent = $this->createUserWithRole(User::ROLE_IT_SUPPORT, ['company_id' => $company->id, 'email' => 'it@acme.test']);

        $ticket = $this->makeTicket($company, $itDept, $creator);

        Sanctum::actingAs($manager);

        // Blocked before ever reaching the assignment-eligibility check —
        // this manager cannot manage an IT-department ticket at all.
        $this->postJson("/api/v1/tickets/{$ticket->id}/assign", ['assigned_to' => $itAgent->id])
            ->assertForbidden();
    }

    public function test_hr_manager_can_manage_ticket_in_any_department(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $itDept = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $company->id, 'email' => 'hr@acme.test']);

        $ticket = $this->makeTicket($company, $itDept, $creator);

        Sanctum::actingAs($hrManager);

        $this->getJson("/api/v1/tickets/{$ticket->id}")->assertOk();
        $this->postJson("/api/v1/tickets/{$ticket->id}/status", ['status' => 'in_progress'])->assertOk();
    }

    public function test_assign_rejects_ineligible_non_agent_user(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $itAgent = $this->createUserWithRole(User::ROLE_IT_SUPPORT, ['company_id' => $company->id, 'email' => 'it@acme.test']);
        $randomEmployee = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'random@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($itAgent);

        $this->postJson("/api/v1/tickets/{$ticket->id}/assign", ['assigned_to' => $randomEmployee->id])
            ->assertStatus(422);
    }

    public function test_assign_accepts_eligible_agent(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $itAgentA = $this->createUserWithRole(User::ROLE_IT_SUPPORT, ['company_id' => $company->id, 'email' => 'it-a@acme.test']);
        $itAgentB = $this->createUserWithRole(User::ROLE_IT_SUPPORT, ['company_id' => $company->id, 'email' => 'it-b@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($itAgentA);

        $this->postJson("/api/v1/tickets/{$ticket->id}/assign", ['assigned_to' => $itAgentB->id])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', $itAgentB->id)
            ->assertJsonPath('data.assignedTo.id', $itAgentB->id)
            ->assertJsonPath('data.assignedTo.name', $itAgentB->name);

        $this->assertDatabaseHas('ticket_activities', [
            'ticket_id' => $ticket->id,
            'action'    => 'assigned',
        ]);
    }

    public function test_company_admin_can_assign_ticket_to_any_company_user(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $company->id, 'email' => 'admin@acme.test']);
        $anyEmployee = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'any@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/tickets/{$ticket->id}/assign", ['assigned_to' => $anyEmployee->id])
            ->assertOk();
    }

    public function test_assign_rejects_user_from_another_company(): void
    {
        $companyA = Company::create(['name' => 'Acme HR']);
        $companyB = Company::create(['name' => 'Globex HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $companyA->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $companyA->id, 'email' => 'creator@acme.test']);
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $companyA->id, 'email' => 'admin@acme.test']);
        $foreignUser = $this->createUserWithRole(User::ROLE_IT_SUPPORT, ['company_id' => $companyB->id, 'email' => 'it@globex.test']);

        $ticket = $this->makeTicket($companyA, $department, $creator);

        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/tickets/{$ticket->id}/assign", ['assigned_to' => $foreignUser->id])
            ->assertStatus(422);
    }

    public function test_ticket_creation_rejects_department_from_another_company(): void
    {
        $companyA = Company::create(['name' => 'Acme HR']);
        $companyB = Company::create(['name' => 'Globex HR']);
        $foreignDepartment = Department::create(['name' => 'IT', 'company_id' => $companyB->id]);
        $employee = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $companyA->id, 'email' => 'creator@acme.test']);

        Sanctum::actingAs($employee);

        $this->postJson('/api/v1/tickets', [
            'department_id' => $foreignDepartment->id,
            'category'      => 'IT',
            'priority'      => 'medium',
            'title'         => 'Cross-tenant attempt',
            'description'   => 'Should be rejected.',
        ])->assertStatus(422);
    }

    public function test_unrelated_employee_cannot_download_attachment_from_someone_elses_ticket(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $stranger = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'stranger@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($stranger);

        $this->get("/api/v1/tickets/{$ticket->id}/attachments/00000000-0000-0000-0000-000000000000/download")
            ->assertForbidden();
    }

    public function test_unrelated_employee_cannot_comment_on_someone_elses_ticket(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);
        $stranger = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'stranger@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($stranger);

        $this->postJson("/api/v1/tickets/{$ticket->id}/comments", ['body' => 'Sneaking in a reply.'])
            ->assertForbidden();
    }

    public function test_owner_can_reopen_resolved_ticket_without_edit_permission(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator, ['status' => 'resolved', 'resolved_at' => now()]);

        Sanctum::actingAs($creator);

        $this->postJson("/api/v1/tickets/{$ticket->id}/status", ['status' => 'reopened'])
            ->assertOk()
            ->assertJsonPath('data.status', 'reopened');
    }

    public function test_owner_cannot_arbitrarily_close_own_ticket_without_edit_permission(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($creator);

        $this->postJson("/api/v1/tickets/{$ticket->id}/status", ['status' => 'closed'])
            ->assertForbidden();
    }

    public function test_non_agent_creator_cannot_post_internal_note(): void
    {
        $company = Company::create(['name' => 'Acme HR']);
        $department = Department::create(['name' => 'IT', 'company_id' => $company->id]);
        $creator = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $company->id, 'email' => 'creator@acme.test']);

        $ticket = $this->makeTicket($company, $department, $creator);

        Sanctum::actingAs($creator);

        $this->postJson("/api/v1/tickets/{$ticket->id}/comments", [
            'body' => 'Trying to sneak an internal note.',
            'is_internal' => true,
        ])->assertCreated();

        $this->assertDatabaseHas('ticket_comments', [
            'ticket_id'   => $ticket->id,
            'is_internal' => false,
        ]);
    }
}
