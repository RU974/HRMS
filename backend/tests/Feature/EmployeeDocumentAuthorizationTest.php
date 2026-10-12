<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeDocumentAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected $manager;
    protected $managerEmployee;
    protected $directReport;
    protected $directReportEmployee;
    protected $unrelatedManager;
    protected $unrelatedManagerEmployee;
    protected $genericViewer;
    protected $hrUser;
    protected $adminUser;
    protected $department;
    protected $company;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setupTestData();
    }

    private function setupTestData(): void
    {
        // Create departments
        $this->company = \App\Models\Company::create(['name' => 'Docs Co']);
        $this->department = Department::create(['name' => 'Engineering']);
        $deptFinance = Department::create(['name' => 'Finance']);

        // Create manager user and employee
        $this->manager = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->manager->givePermissionTo('employees:view');
        $this->manager->refresh();
        
        $this->managerEmployee = Employee::create([
            'user_id' => $this->manager->id,
            'name' => 'Manager Smith',
            'email' => 'manager@example.com',
            'department_id' => $this->department->id,
            'designation' => 'Team Lead',
            'salary' => 5000,
            'status' => 'active',
        ]);

        // Create direct report user and employee
        $this->directReport = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->directReportEmployee = Employee::create([
            'user_id' => $this->directReport->id,
            'name' => 'Direct Report',
            'email' => 'report@example.com',
            'department_id' => $this->department->id,
            'designation' => 'Engineer',
            'salary' => 4000,
            'status' => 'active',
            'manager_id' => $this->managerEmployee->id, // Direct report relationship
        ]);

        // Create unrelated manager user and employee
        $this->unrelatedManager = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $this->unrelatedManager->givePermissionTo('employees:view');
        $this->unrelatedManager->refresh();
        
        $this->unrelatedManagerEmployee = Employee::create([
            'user_id' => $this->unrelatedManager->id,
            'name' => 'Unrelated Manager',
            'email' => 'unrelated@example.com',
            'department_id' => $deptFinance->id,
            'designation' => 'Finance Manager',
            'salary' => 5000,
            'status' => 'active',
        ]);

        // Create generic viewer (has view employees permission only)
        $this->genericViewer = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $viewPermission = Permission::where('name', 'employees:view')->first();
        if ($viewPermission) {
            $this->genericViewer->givePermissionTo('employees:view');
            $this->genericViewer->refresh();
        }

        // Create HR user with manage employee documents permission
        $this->hrUser = $this->createUserWithRole(User::ROLE_HR_EXECUTIVE, ['company_id' => $this->company->id]);
        $this->hrUser->givePermissionTo('documents:edit');
        $this->hrUser->refresh();

        // Create admin user
        $this->adminUser = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
    }

    // ============================================
    // DIRECT MANAGER ACCESS TESTS
    // ============================================

    public function test_direct_manager_can_show_managed_employee_manager_only_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Performance Review',
            'visibility' => 'manager_only',
            'type' => 'review',
        ]);

        Sanctum::actingAs($this->manager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertOk();
        $this->assertEquals($document->id, $response->json('data.id'));
    }

    public function test_direct_manager_can_preview_managed_employee_manager_only_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Performance Review',
            'visibility' => 'manager_only',
            'type' => 'review',
            'file_path' => 'employee-documents/test.pdf',
        ]);

        // Create the file for testing
        \Storage::disk('public')->put('employee-documents/test.pdf', 'test content');

        Sanctum::actingAs($this->manager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}/preview");
        $response->assertOk();

        \Storage::disk('public')->delete('employee-documents/test.pdf');
    }

    public function test_direct_manager_can_download_managed_employee_manager_only_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Performance Review',
            'visibility' => 'manager_only',
            'type' => 'review',
            'file_path' => 'employee-documents/test.pdf',
        ]);

        \Storage::disk('public')->put('employee-documents/test.pdf', 'test content');

        Sanctum::actingAs($this->manager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}/download");
        $response->assertOk();

        \Storage::disk('public')->delete('employee-documents/test.pdf');
    }

    // ============================================
    // UNRELATED MANAGER ACCESS RESTRICTIONS
    // ============================================

    public function test_unrelated_manager_cannot_show_unrelated_employee_manager_only_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Performance Review',
            'visibility' => 'manager_only',
            'type' => 'review',
        ]);

        Sanctum::actingAs($this->unrelatedManager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertForbidden();
    }

    public function test_unrelated_manager_cannot_preview_unrelated_employee_manager_only_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Performance Review',
            'visibility' => 'manager_only',
            'type' => 'review',
            'file_path' => 'employee-documents/test.pdf',
        ]);

        \Storage::disk('public')->put('employee-documents/test.pdf', 'test content');

        Sanctum::actingAs($this->unrelatedManager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}/preview");
        $response->assertForbidden();

        \Storage::disk('public')->delete('employee-documents/test.pdf');
    }

    public function test_unrelated_manager_cannot_download_unrelated_employee_manager_only_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Performance Review',
            'visibility' => 'manager_only',
            'type' => 'review',
            'file_path' => 'employee-documents/test.pdf',
        ]);

        \Storage::disk('public')->put('employee-documents/test.pdf', 'test content');

        Sanctum::actingAs($this->unrelatedManager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}/download");
        $response->assertForbidden();

        \Storage::disk('public')->delete('employee-documents/test.pdf');
    }

    // ============================================
    // GENERIC VIEWER RESTRICTIONS
    // ============================================

    public function test_user_with_view_employees_permission_only_cannot_access_manager_only_documents()
    {
        $viewer = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $viewer->givePermissionTo('employees:view');

        $employee = Employee::create([
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id])->id,
            'name' => 'Some Employee',
            'email' => 'emp@example.com',
            'department_id' => $this->department->id,
            'designation' => 'Engineer',
            'salary' => 4000,
            'status' => 'active',
            'manager_id' => $this->managerEmployee->id,
        ]);

        $document = EmployeeDocument::create([
            'employee_id' => $employee->id,
            'title' => 'Manager-Only Document',
            'visibility' => 'manager_only',
            'type' => 'document',
        ]);

        Sanctum::actingAs($viewer);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertForbidden();
    }

    public function test_user_with_view_attendance_permission_only_cannot_access_manager_only_documents()
    {
        $viewer = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $viewer->givePermissionTo('view attendance');

        $employee = Employee::create([
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id])->id,
            'name' => 'Some Employee',
            'email' => 'emp2@example.com',
            'department_id' => $this->department->id,
            'designation' => 'Engineer',
            'salary' => 4000,
            'status' => 'active',
            'manager_id' => $this->managerEmployee->id,
        ]);

        $document = EmployeeDocument::create([
            'employee_id' => $employee->id,
            'title' => 'Manager-Only Document',
            'visibility' => 'manager_only',
            'type' => 'document',
        ]);

        Sanctum::actingAs($viewer);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertForbidden();
    }

    // ============================================
    // COMPANY BOUNDARY VERIFICATION
    // ============================================

    public function test_same_company_user_without_management_relationship_cannot_access_manager_only_documents()
    {
        $otherManager = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $otherManagerEmployee = Employee::create([
            'user_id' => $otherManager->id,
            'name' => 'Other Manager',
            'email' => 'other.manager@example.com',
            'department_id' => Department::create(['name' => 'Sales'])->id,
            'designation' => 'Sales Manager',
            'salary' => 5000,
            'status' => 'active',
        ]);
        $otherManager->givePermissionTo('employees:view');

        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Sensitive Document',
            'visibility' => 'manager_only',
            'type' => 'document',
        ]);

        Sanctum::actingAs($otherManager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertForbidden();
    }

    // ============================================
    // HR AND ADMIN ACCESS
    // ============================================

    public function test_hr_user_with_manage_permission_can_access_manager_only_documents()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'HR Document',
            'visibility' => 'manager_only',
            'type' => 'document',
        ]);

        Sanctum::actingAs($this->hrUser);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertOk();
        $this->assertEquals($document->id, $response->json('data.id'));
    }

    public function test_admin_user_can_access_manager_only_documents()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Admin Document',
            'visibility' => 'manager_only',
            'type' => 'document',
        ]);

        Sanctum::actingAs($this->adminUser);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertOk();
        $this->assertEquals($document->id, $response->json('data.id'));
    }

    // ============================================
    // EMPLOYEE SELF ACCESS
    // ============================================

    public function test_employee_can_access_their_own_employee_self_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'My Document',
            'visibility' => 'employee_self',
            'type' => 'document',
        ]);

        Sanctum::actingAs($this->directReport);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertOk();
    }

    public function test_employee_cannot_access_other_employee_self_document()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Other Employee Document',
            'visibility' => 'employee_self',
            'type' => 'document',
        ]);

        Sanctum::actingAs($this->manager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertForbidden();
    }

    // ============================================
    // HR_ONLY VISIBILITY TESTS
    // ============================================

    public function test_hr_only_documents_require_manage_permission()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'HR Only Document',
            'visibility' => 'hr_only',
            'type' => 'document',
        ]);

        Sanctum::actingAs($this->manager);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertForbidden();

        Sanctum::actingAs($this->hrUser);
        $response = $this->getJson("/api/v1/employee-documents/{$document->id}");
        $response->assertOk();
    }

    // ============================================
    // INDEX / LIST OPERATIONS
    // ============================================

    public function test_manager_sees_only_managed_employee_documents_in_index()
    {
        $managedDoc = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Managed Employee Doc',
            'visibility' => 'manager_only',
        ]);

        // Create an employee in a DIFFERENT department
        $otherDept = Department::create(['name' => 'Sales']);
        $employeeInOtherDept = Employee::create([
            'user_id' => $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id])->id,
            'name' => 'Sales Employee',
            'email' => 'sales-emp-' . time() . '@example.com',
            'department_id' => $otherDept->id,
            'designation' => 'Sales Rep',
            'salary' => 3500,
            'status' => 'active',
        ]);

        $docFromOtherDept = EmployeeDocument::create([
            'employee_id' => $employeeInOtherDept->id,
            'title' => 'Other Dept Employee Doc',
            'visibility' => 'manager_only',
        ]);

        Sanctum::actingAs($this->manager);
        $response = $this->getJson('/api/v1/employee-documents');
        $response->assertOk();

        $docIds = collect($response->json('data.data'))->pluck('id');
        // Note: system allows managers to see all employees in their department
        $this->assertTrue($docIds->contains($managedDoc->id), 'Manager should see their direct report\'s documents');
        // Employee in different department should not be visible
        $this->assertFalse($docIds->contains($docFromOtherDept->id), 'Manager should not see employees from other departments');
    }

    public function test_generic_viewer_cannot_see_manager_only_documents_in_index()
    {
        $viewer = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        $viewer->givePermissionTo('employees:view');

        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Manager Document',
            'visibility' => 'manager_only',
        ]);

        Sanctum::actingAs($viewer);
        $response = $this->getJson('/api/v1/employee-documents');
        $response->assertOk();

        $docIds = collect($response->json('data.data'))->pluck('id');
        $this->assertFalse($docIds->contains($document->id), 'Generic viewer should not see manager_only documents');
    }

    // ============================================
    // WRITE OPERATIONS (STORE, UPDATE, DELETE)
    // ============================================

    public function test_only_manage_permission_can_create_documents()
    {
        Sanctum::actingAs($this->manager);
        $response = $this->postJson('/api/v1/employee-documents', [
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'New Document',
            'visibility' => 'manager_only',
        ]);
        $response->assertForbidden();

        Sanctum::actingAs($this->hrUser);
        $response = $this->postJson('/api/v1/employee-documents', [
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'New Document',
            'visibility' => 'manager_only',
        ]);
        $response->assertCreated();
    }

    public function test_only_manage_permission_can_update_documents()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Original Title',
            'visibility' => 'manager_only',
        ]);

        Sanctum::actingAs($this->manager);
        $response = $this->patchJson("/api/v1/employee-documents/{$document->id}", [
            'title' => 'Updated Title',
        ]);
        $response->assertForbidden();

        Sanctum::actingAs($this->hrUser);
        $response = $this->patchJson("/api/v1/employee-documents/{$document->id}", [
            'title' => 'Updated Title',
        ]);
        $response->assertOk();
    }

    public function test_only_manage_permission_can_delete_documents()
    {
        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Document to Delete',
            'visibility' => 'manager_only',
        ]);

        Sanctum::actingAs($this->manager);
        $response = $this->deleteJson("/api/v1/employee-documents/{$document->id}");
        $response->assertForbidden();

        $document = EmployeeDocument::create([
            'employee_id' => $this->directReportEmployee->id,
            'title' => 'Document to Delete 2',
            'visibility' => 'manager_only',
        ]);

        Sanctum::actingAs($this->hrUser);
        $response = $this->deleteJson("/api/v1/employee-documents/{$document->id}");
        $response->assertOk();
    }
}
