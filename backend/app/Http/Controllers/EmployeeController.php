<?php

namespace App\Http\Controllers;

use App\Models\Designation;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use App\Models\Shift;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class EmployeeController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'employees:view');

        $query = Employee::with(['department', 'designationRef', 'user']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query);
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('department_id')) {
            $query->where('department_id', $request->department_id);
        }
        if ($request->filled('designation_id')) {
            $query->where('designation_id', $request->designation_id);
        }
        if ($request->filled('designation')) {
            $query->where('designation', 'like', '%' . $request->designation . '%');
        }
        if ($request->filled('created_from')) {
            $query->whereDate('created_at', '>=', $request->created_from);
        }
        if ($request->filled('created_to')) {
            $query->whereDate('created_at', '<=', $request->created_to);
        }

        $sortBy = $request->input('sort_by', 'created_at');
        $sortDir = strtolower($request->input('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        if (!in_array($sortBy, ['created_at', 'name', 'email', 'salary', 'status'], true)) {
            $sortBy = 'created_at';
        }

        return $this->ok($query->orderBy($sortBy, $sortDir)->paginate((int) $request->input('per_page', 15)));
    }

    public function show(Request $request, $id)
    {
        $employee = Employee::with(['department', 'designationRef', 'user'])->findOrFail($id);
        $this->authorizeEmployeeRead($request, $employee);
        $this->assertEmployeeInCompany($request, $employee);

        return $this->ok($employee);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'employees:create');

        if (! app(\App\Services\LicenseService::class)->canAddEmployee($request->user()?->company_id)) {
            return response()->json([
                'message' => 'Employee limit reached. Upgrade your license to add more employees.',
            ], 403);
        }

        $validated = $request->validate([
            'user_id' => ['nullable', 'exists:users,id', Rule::unique('employees', 'user_id')],
            'name' => 'nullable|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|string|email|max:255|unique:employees',
            'username' => 'nullable|string|max:255|unique:users,username',
            'phone' => 'nullable|string|max:20',
            'cnic' => 'nullable|string|max:25',
            'date_of_birth' => 'nullable|date',
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'address' => 'nullable|string|max:1000',
            'designation' => 'nullable|string|max:255',
            'designation_id' => 'nullable|exists:designations,id',
            'employee_number' => 'nullable|string|max:50|unique:employees,employee_number',
            'position' => 'nullable|string|max:255',
            'joining_date' => 'nullable|date',
            'employment_type' => 'nullable|string|max:100',
            'shift_id' => 'nullable|exists:shifts,id',
            'manager_id' => 'nullable|exists:employees,id',
            'salary' => 'required|numeric|min:0',
            'basic_salary' => 'nullable|numeric|min:0',
            'allowances' => 'nullable|numeric|min:0',
            'department_id' => 'required|exists:departments,id',
            'status' => 'nullable|in:active,inactive',
            'create_user' => 'nullable|boolean',
            'password' => 'nullable|string|min:8',
            'role' => 'nullable|string|in:' . implode(',', User::availableRoles()),
        ]);

        $this->assertUserCompanyMatch($request, $validated['user_id'] ?? null);
        $this->assertEmployeeReferenceInCompany($request, $validated['manager_id'] ?? null);
        $name = $validated['name'] ?? trim(($validated['first_name'] ?? '') . ' ' . ($validated['last_name'] ?? ''));
        $employee = DB::transaction(function () use ($validated, $name, $request) {
            $linkedUserId = $validated['user_id'] ?? null;
            $createUser = $validated['create_user'] ?? true;
            $roleName = $validated['role'] ?? User::ROLE_EMPLOYEE;

            if (!$linkedUserId && $createUser) {
                $existingUser = User::where('email', $validated['email'])->first();
                if ($existingUser) {
                    $this->assertUserCompanyMatch($request, $existingUser);
                    $linkedUserId = $existingUser->id;
                } else {
                    $linkedUser = User::create([
                        'name' => $name,
                        'email' => $validated['email'],
                        'username' => $validated['username'] ?? explode('@', $validated['email'])[0],
                        'password' => Hash::make($validated['password'] ?? Str::password(12)),
                        'company_id' => $request->user()?->company_id,
                ]);
                $linkedUserId = $linkedUser->id;
            }
            }

            if (!$linkedUserId) {
                throw ValidationException::withMessages([
                    'user_id' => ['user_id is required when create_user is false.'],
                ]);
            }
            if (Employee::where('user_id', $linkedUserId)->exists()) {
                throw ValidationException::withMessages([
                    'user_id' => ['This user is already linked to another employee.'],
                ]);
            }

            $user = User::findOrFail($linkedUserId);
            $this->assertUserCompanyMatch($request, $user);
            $this->assignRoleToUser($user, $roleName);

            $designationLabel = $validated['designation'] ?? ($validated['position'] ?? '');
            if (!empty($validated['designation_id'])) {
                $designationLabel = Designation::find($validated['designation_id'])?->name ?? $designationLabel;
            }

            return Employee::create([
                'user_id' => $linkedUserId,
                'name' => $name,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'first_name' => $validated['first_name'] ?? null,
                'last_name' => $validated['last_name'] ?? null,
                'cnic' => $validated['cnic'] ?? null,
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'address' => $validated['address'] ?? null,
                'employee_number' => $validated['employee_number'] ?? null,
                'joining_date' => $validated['joining_date'] ?? null,
                'employment_type' => $validated['employment_type'] ?? null,
                'shift_id' => $validated['shift_id'] ?? null,
                'manager_id' => $validated['manager_id'] ?? null,
                'department_id' => $validated['department_id'],
                'designation_id' => $validated['designation_id'] ?? null,
                'designation' => $designationLabel,
                'basic_salary' => $validated['basic_salary'] ?? $validated['salary'],
                'allowances' => $validated['allowances'] ?? 0,
                'salary' => ($validated['basic_salary'] ?? $validated['salary']) + ($validated['allowances'] ?? 0),
                'profile_image' => $request->hasFile('profile_image') ? Storage::disk('public')->putFile('employee-profiles', $request->file('profile_image')) : null,
                'status' => $validated['status'] ?? 'active',
            ]);
        });

        return $this->ok($employee->load(['department', 'designationRef', 'user']), 'Employee created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:edit');
        $employee = Employee::findOrFail($id);
        $this->assertEmployeeInCompany($request, $employee);
        $this->authorizeManagedEmployeeAccess($request, $employee->id, 'employee');
        $validated = $request->validate([
            'user_id' => ['sometimes', 'exists:users,id', Rule::unique('employees', 'user_id')->ignore($id)],
            'name' => 'sometimes|string|max:255',
            'first_name' => 'sometimes|string|max:255',
            'last_name' => 'sometimes|string|max:255',
            'email' => 'sometimes|string|email|max:255|unique:employees,email,' . $id,
            'username' => ['sometimes', 'nullable', 'string', 'max:255', Rule::unique('users', 'username')->ignore($request->user()?->id)],
            'phone' => 'nullable|string|max:20',
            'cnic' => 'nullable|string|max:25',
            'date_of_birth' => 'nullable|date',
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'address' => 'nullable|string|max:1000',
            'designation' => 'sometimes|string|max:255',
            'designation_id' => 'sometimes|nullable|exists:designations,id',
            'employee_number' => ['sometimes', 'nullable', 'string', 'max:50', Rule::unique('employees', 'employee_number')->ignore($id)],
            'position' => 'sometimes|string|max:255',
            'joining_date' => 'nullable|date',
            'employment_type' => 'nullable|string|max:100',
            'shift_id' => 'nullable|exists:shifts,id',
            'manager_id' => 'nullable|exists:employees,id',
            'salary' => 'sometimes|numeric|min:0',
            'basic_salary' => 'sometimes|numeric|min:0',
            'allowances' => 'sometimes|numeric|min:0',
            'department_id' => 'sometimes|exists:departments,id',
            'status' => 'sometimes|in:active,inactive',
        ]);
        $this->assertEmployeeReferenceInCompany($request, $validated['manager_id'] ?? null);

        $updatePayload = $validated;
        if (!isset($updatePayload['name']) && (isset($updatePayload['first_name']) || isset($updatePayload['last_name']))) {
            $updatePayload['name'] = trim(($updatePayload['first_name'] ?? '') . ' ' . ($updatePayload['last_name'] ?? ''));
        }
        if (!isset($updatePayload['designation']) && isset($updatePayload['position'])) {
            $updatePayload['designation'] = $updatePayload['position'];
        }
        if (isset($updatePayload['basic_salary']) || isset($updatePayload['allowances'])) {
            $basic = $updatePayload['basic_salary'] ?? $employee->basic_salary ?? 0;
            $allowances = $updatePayload['allowances'] ?? $employee->allowances ?? 0;
            $updatePayload['salary'] = $basic + $allowances;
        }
        if (array_key_exists('designation_id', $updatePayload) && $updatePayload['designation_id']) {
            $updatePayload['designation'] = Designation::find($updatePayload['designation_id'])?->name ?? ($updatePayload['designation'] ?? $employee->designation);
        }
        if ($request->hasFile('profile_image')) {
            $updatePayload['profile_image'] = Storage::disk('public')->putFile('employee-profiles', $request->file('profile_image'));
        }

        unset($updatePayload['first_name'], $updatePayload['last_name'], $updatePayload['position']);
        $employee->update($updatePayload);

        return $this->ok($employee->load(['department', 'designationRef', 'user']), 'Employee updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:delete');
        $employee = Employee::findOrFail($id);
        $this->assertEmployeeInCompany($request, $employee);
        $this->authorizeManagedEmployeeAccess($request, $employee->id, 'employee');
        $employee->delete();
        return $this->ok(null, 'Employee deleted successfully');
    }

    public function getByDepartment(Request $request, $departmentId)
    {
        $this->authorizePermission($request, 'employees:view');

        $query = Employee::with(['department', 'designationRef', 'user'])
            ->where('department_id', $departmentId);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query);

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function search(Request $request)
    {
        $this->authorizePermission($request, 'employees:view');

        $term = $request->input('q', '');
        $query = Employee::where(function ($search) use ($term): void {
            $search->where('name', 'like', "%$term%")
                ->orWhere('email', 'like', "%$term%")
                ->orWhere('designation', 'like', "%$term%");
        })
            ->with(['department', 'designationRef', 'user']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query);

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function setUserPassword(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:edit');
        $employee = Employee::with('user')->findOrFail($id);
        $this->assertEmployeeInCompany($request, $employee);
        $this->authorizeManagedEmployeeAccess($request, $employee->id, 'employee');
        $validated = $request->validate(['password' => 'required|string|min:8|confirmed']);

        if (!$employee->user) {
            return $this->fail('Linked user not found for this employee.', 404);
        }

        $employee->user->update(['password' => Hash::make($validated['password'])]);
        return $this->ok(null, 'Employee user password updated successfully');
    }

    public function bulkAction(Request $request)
    {
        $this->authorizePermission($request, 'employees:delete');
        $validated = $request->validate([
            'action' => 'required|in:activate,deactivate,delete',
            'employee_ids' => 'required|array|min:1',
            'employee_ids.*' => 'integer|exists:employees,id',
        ]);

        $query = Employee::whereIn('id', $validated['employee_ids']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query);
        if ($validated['action'] === 'activate') {
            $query->update(['status' => 'active']);
        } elseif ($validated['action'] === 'deactivate') {
            $query->update(['status' => 'inactive']);
        } else {
            $query->delete();
        }

        return $this->ok(null, 'Bulk action executed successfully');
    }

    public function export(Request $request)
    {
        $this->authorizePermission($request, 'employees:export');

        $rows = Employee::query()
            ->with(['department', 'designationRef'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->department_id));

        $this->scopeToCompany($request, $rows);
        $this->applyManagedEmployeeScope($request, $rows);

        $rows = $rows->orderBy('created_at', 'desc')->get();

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="employees.csv"',
        ];

        $callback = function () use ($rows): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Status', 'Salary', 'Created At']);
            foreach ($rows as $row) {
                fputcsv($out, [
                    $row->id,
                    $row->name,
                    $row->email,
                    $row->phone,
                    $row->department?->name,
                    $row->designationRef?->name ?? $row->designation,
                    $row->status,
                    $row->salary,
                    $row->created_at,
                ]);
            }
            fclose($out);
        };

        return response()->stream($callback, 200, $headers);
    }


    private function authorizeEmployeeRead(Request $request, Employee $employee): void
    {
        if ($request->user()?->can('employees:view')) {
            $this->authorizeManagedEmployeeAccess($request, $employee->id, 'employee');
            return;
        }
        if ($request->user()?->id === $employee->user_id) {
            return;
        }
        abort(403, 'You are not authorized to access this employee.');
    }

    private function scopeToCompany(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }

    private function assertEmployeeInCompany(Request $request, Employee $employee): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if ((string) ($employee->user?->company_id ?? '') !== (string) $companyId) {
            abort(403, 'You are not authorized to access this employee.');
        }
    }

    private function assertUserCompanyMatch(Request $request, mixed $userOrId): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId || empty($userOrId)) {
            return;
        }

        $user = $userOrId instanceof User
            ? $userOrId
            : User::query()->select(['id', 'company_id'])->find($userOrId);

        if (!$user || (string) ($user->company_id ?? '') !== (string) $companyId) {
            abort(403, 'You are not authorized to use this user account.');
        }
    }

    private function assertEmployeeReferenceInCompany(Request $request, mixed $employeeId): void
    {
        if (empty($employeeId)) {
            return;
        }

        $employee = Employee::with('user')->find($employeeId);
        if ($employee) {
            $this->assertEmployeeInCompany($request, $employee);
        }
    }

    public function import(Request $request)
    {
        $this->authorizePermission($request, 'employees:create');

        $request->validate(['file' => 'required|file|mimes:csv,txt|max:2048']);

        $file    = $request->file('file');
        $handle  = fopen($file->getRealPath(), 'r');
        $headers = fgetcsv($handle); // skip header row

        if (!$headers) {
            return $this->fail('CSV file is empty or has no header row.');
        }

        $companyId    = $request->user()?->company_id;
        $imported     = 0;
        $skipped      = 0;
        $errors       = [];
        $defaultDeptId = \App\Models\Department::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->value('id');

        while (($row = fgetcsv($handle)) !== false) {
            $data = array_combine(array_map('strtolower', array_map('trim', $headers)), array_map('trim', $row));

            $email = $data['email'] ?? null;
            if (!$email || !\Illuminate\Support\Facades\Validator::make(['email' => $email], ['email' => 'email'])->passes()) {
                $skipped++;
                $errors[] = "Row skipped — invalid or missing email: " . ($email ?? '(empty)');
                continue;
            }

            if (Employee::where('email', $email)->exists()) {
                $skipped++;
                $errors[] = "Row skipped — email already exists: {$email}";
                continue;
            }

            $deptName = $data['department'] ?? null;
            $deptId   = $defaultDeptId;
            if ($deptName) {
                $dept = \App\Models\Department::query()
                    ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
                    ->where('name', 'like', $deptName)
                    ->value('id');
                if ($dept) $deptId = $dept;
            }

            if (!$deptId) {
                $skipped++;
                $errors[] = "Row skipped — no department found for: {$email}";
                continue;
            }

            $name = $data['name'] ?? (trim(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? '')) ?: null);

            Employee::create([
                'name'            => $name ?? $email,
                'first_name'      => $data['first_name'] ?? null,
                'last_name'       => $data['last_name'] ?? null,
                'email'           => $email,
                'phone'           => $data['phone'] ?? null,
                'department_id'   => $deptId,
                'designation'     => $data['designation'] ?? null,
                'joining_date'    => !empty($data['joining_date']) ? $data['joining_date'] : null,
                'employment_type' => $data['employment_type'] ?? 'full_time',
                'basic_salary'    => is_numeric($data['basic_salary'] ?? null) ? $data['basic_salary'] : 0,
                'status'          => 'active',
                'salary'          => is_numeric($data['basic_salary'] ?? null) ? $data['basic_salary'] : 0,
            ]);

            $imported++;
        }

        fclose($handle);

        return $this->ok([
            'imported' => $imported,
            'skipped'  => $skipped,
            'errors'   => $errors,
        ], "{$imported} employee(s) imported successfully.");
    }

    private function assignRoleToUser(User $user, ?string $roleName): void
    {
        $resolvedRoleName = $roleName ?: User::ROLE_EMPLOYEE;

        if ($resolvedRoleName === User::ROLE_EMPLOYEE) {
            $role = Role::firstOrCreate(
                ['name' => User::ROLE_EMPLOYEE, 'company_id' => null],
                ['guard_name' => 'web', 'description' => 'Default employee role', 'is_system' => true]
            );
        } else {
            $role = Role::query()
                ->where('name', $resolvedRoleName)
                ->where('guard_name', 'web')
                ->where(function ($query) use ($user): void {
                    $query->whereNull('company_id');

                    if ($user->company_id) {
                        $query->orWhere('company_id', $user->company_id);
                    }
                })
                ->first();
        }

        if (!$role) {
            throw ValidationException::withMessages([
                'role' => ['Selected role could not be assigned to the employee account.'],
            ]);
        }

        $user->assignRole($role);
    }
}