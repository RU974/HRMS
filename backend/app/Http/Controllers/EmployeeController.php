<?php

namespace App\Http\Controllers;

use App\Jobs\ExportEmployeesJob;
use App\Jobs\ImportEmployeesJob;
use App\Models\BackgroundRun;
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
    private const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'employees:view');

        $query = Employee::with(['department', 'designationRef', 'user', 'shift', 'manager']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query);
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->input('search')) . '%';
            $query->where(function ($search) use ($term): void {
                $search->where('name', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('employee_number', 'like', $term)
                    ->orWhere('designation', 'like', $term)
                    ->orWhere('phone', 'like', $term)
                    ->orWhereHas('department', fn ($q) => $q->where('name', 'like', $term))
                    ->orWhereHas('designationRef', fn ($q) => $q->where('name', 'like', $term));
            });
        }
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
        $employee = Employee::with(['department', 'designationRef', 'user.roles', 'shift', 'manager'])->findOrFail($id);
        $this->authorizeEmployeeRead($request, $employee);
        $this->assertThisEmployeeInCompany($request, $employee);

        return $this->ok($employee);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'employees:create');

        $isSuperAdmin = (bool) $request->user()?->hasAnyRole([User::ROLE_SUPER_ADMIN]);

        $this->decodeEmergencyContacts($request);

        $validated = $request->validate([
            ...$this->emergencyContactRules(),
            'user_id' => ['nullable', 'exists:users,id', Rule::unique('employees', 'user_id')],
            'company_id' => [$isSuperAdmin ? 'required' : 'nullable', 'uuid', 'exists:companies,id'],
            'name' => 'nullable|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|string|email|max:255|unique:employees',
            'username' => 'nullable|string|max:255|unique:users,username',
            'phone' => 'nullable|string|max:20',
            'cnic' => 'nullable|string|max:25',
            'date_of_birth' => 'nullable|date',
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'blood_group' => ['nullable', Rule::in(self::BLOOD_GROUPS)],
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
            'commission_percentage' => 'nullable|numeric|min:0|max:100',
            'department_id' => 'required|exists:departments,id',
            'status' => 'nullable|in:active,inactive',
            'create_user' => 'nullable|boolean',
            'password' => 'nullable|string|min:8',
            'role' => 'nullable|string|in:' . implode(',', User::availableRoles()),
        ]);

        // Non-super-admins can only create employees in their own company;
        // super admins must explicitly pick the target company (validated above).
        $companyId = $isSuperAdmin ? $validated['company_id'] : $request->user()?->company_id;

        $licenseService = app(\App\Services\LicenseService::class);
        try {
            $licenseService->assertCanAddEmployee($companyId);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->assertUserCompanyMatch($request, $validated['user_id'] ?? null);
        $this->assertEmployeeReferenceInCompany($request, $validated['manager_id'] ?? null);
        $name = $validated['name'] ?? trim(($validated['first_name'] ?? '') . ' ' . ($validated['last_name'] ?? ''));
        $employee = DB::transaction(function () use ($validated, $name, $request, $companyId) {
            $linkedUserId = $validated['user_id'] ?? null;
            $createUser = $validated['create_user'] ?? true;
            $roleName = $validated['role'] ?? User::ROLE_EMPLOYEE;

            if (!$linkedUserId && $createUser) {
                $existingUser = User::where('email', $validated['email'])->first();
                if ($existingUser) {
                    if ((string) ($existingUser->company_id ?? '') !== (string) $companyId) {
                        throw ValidationException::withMessages([
                            'email' => ['A user account with this email already exists in another company. Use a different email.'],
                        ]);
                    }
                    $this->assertUserCompanyMatch($request, $existingUser);
                    $linkedUserId = $existingUser->id;
                } else {
                    $linkedUser = User::create([
                        'name' => $name,
                        'email' => $validated['email'],
                        'username' => $validated['username'] ?? explode('@', $validated['email'])[0],
                        'password' => Hash::make($validated['password'] ?? Str::password(12)),
                        'company_id' => $companyId,
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
                'company_id' => $companyId,
                'name' => $name,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'first_name' => $validated['first_name'] ?? null,
                'last_name' => $validated['last_name'] ?? null,
                'cnic' => $validated['cnic'] ?? null,
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'blood_group' => $validated['blood_group'] ?? null,
                'address' => $validated['address'] ?? null,
                'emergency_contacts' => $validated['emergency_contacts'] ?? [],
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
                'commission_percentage' => $validated['commission_percentage'] ?? null,
                'salary' => ($validated['basic_salary'] ?? $validated['salary']) + ($validated['allowances'] ?? 0),
                'profile_image' => $request->hasFile('profile_image') ? Storage::disk('public')->putFile('employee-profiles', $request->file('profile_image')) : null,
                'status' => $validated['status'] ?? 'active',
            ]);
        });

        return $this->ok($employee->load(['department', 'designationRef', 'user', 'shift', 'manager']), 'Employee created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:edit');
        $employee = Employee::findOrFail($id);
        $this->assertThisEmployeeInCompany($request, $employee);
        $this->authorizeManagedEmployeeAccess($request, $employee->id, 'employee');
        $this->decodeEmergencyContacts($request);
        $validated = $request->validate([
            ...$this->emergencyContactRules(),
            'user_id' => ['sometimes', 'exists:users,id', Rule::unique('employees', 'user_id')->ignore($id)],
            'name' => 'sometimes|string|max:255',
            'first_name' => 'sometimes|string|max:255',
            'last_name' => 'sometimes|string|max:255',
            'email' => 'sometimes|string|email|max:255|unique:employees,email,' . $id,
            'username' => ['sometimes', 'nullable', 'string', 'max:255', Rule::unique('users', 'username')->ignore($employee->user_id)],
            'password' => 'sometimes|nullable|string|min:8',
            'role' => 'sometimes|nullable|string|in:' . implode(',', User::availableRoles()),
            'phone' => 'nullable|string|max:20',
            'cnic' => 'nullable|string|max:25',
            'date_of_birth' => 'nullable|date',
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'blood_group' => ['nullable', Rule::in(self::BLOOD_GROUPS)],
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
            'commission_percentage' => 'sometimes|nullable|numeric|min:0|max:100',
            'department_id' => 'sometimes|exists:departments,id',
            'status' => 'sometimes|in:active,inactive',
        ]);
        $this->assertEmployeeReferenceInCompany($request, $validated['manager_id'] ?? null);

        // Login account fields live on the linked user, not the employee row.
        $accountInput = [];
        foreach (['username', 'password', 'role'] as $field) {
            if (empty($validated[$field])) {
                continue;
            }
            // The edit form always resends the current username/role; only real changes count.
            if ($field === 'username' && $validated[$field] === $employee->user?->username) {
                continue;
            }
            if ($field === 'role' && $employee->user?->roles->pluck('name')->contains($validated[$field])) {
                continue;
            }
            $accountInput[$field] = $validated[$field];
        }
        unset($validated['username'], $validated['password'], $validated['role']);
        if ($accountInput !== []) {
            $this->authorizePermission($request, 'users:edit');
        }

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

        // Gate: reactivating a single inactive employee counts as a new seat add.
        if (isset($updatePayload['status']) && $updatePayload['status'] === 'active' && $employee->status !== 'active') {
            try {
                app(\App\Services\LicenseService::class)->assertCanAddEmployee($request->user()?->company_id);
            } catch (\RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        $employee->update($updatePayload);

        $linkedUser = $employee->user;
        if ($accountInput !== [] && $linkedUser) {
            $this->assertUserCompanyMatch($request, $linkedUser);
            if (isset($accountInput['username'])) {
                $linkedUser->username = $accountInput['username'];
            }
            if (isset($accountInput['password'])) {
                $linkedUser->password = Hash::make($accountInput['password']);
            }
            $linkedUser->save();
            if (isset($accountInput['role'])) {
                $this->assignRoleToUser($linkedUser, $accountInput['role'], true);
                app(\App\Services\PermissionService::class)->flushUserPermissionCache($linkedUser);
            }
        }

        return $this->ok($employee->load(['department', 'designationRef', 'user.roles', 'shift', 'manager']), 'Employee updated successfully');
    }

    /** Multipart requests send emergency_contacts as a JSON string; turn it into an array. */
    private function decodeEmergencyContacts(Request $request): void
    {
        $raw = $request->input('emergency_contacts');
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $request->merge(['emergency_contacts' => is_array($decoded) ? $decoded : null]);
        }
    }

    private function emergencyContactRules(): array
    {
        return [
            'emergency_contacts' => 'sometimes|nullable|array|max:10',
            'emergency_contacts.*.name' => 'required|string|max:255',
            'emergency_contacts.*.relationship' => 'required|string|max:100',
            'emergency_contacts.*.phone' => 'required|string|max:20',
            'emergency_contacts.*.email' => 'nullable|email|max:255',
        ];
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:delete');
        $employee = Employee::findOrFail($id);
        $this->assertThisEmployeeInCompany($request, $employee);
        $this->authorizeManagedEmployeeAccess($request, $employee->id, 'employee');
        $employee->delete();
        return $this->ok(null, 'Employee deleted successfully');
    }

    public function getByDepartment(Request $request, $departmentId)
    {
        $this->authorizePermission($request, 'employees:view');

        $query = Employee::with(['department', 'designationRef', 'user', 'shift', 'manager'])
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
                ->orWhere('employee_number', 'like', "%$term%")
                ->orWhere('designation', 'like', "%$term%");
        })
            ->with(['department', 'designationRef', 'user', 'shift', 'manager']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query);

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function setUserPassword(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:edit');
        $employee = Employee::with('user')->findOrFail($id);
        $this->assertThisEmployeeInCompany($request, $employee);
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
            // Seat check: count how many inactive employees are being re-activated
            // and ensure the license can absorb them all before committing.
            $inactiveCount  = (clone $query)->where('status', '!=', 'active')->count();
            $licenseService = app(\App\Services\LicenseService::class);
            $companyId      = $request->user()?->company_id;

            if ($inactiveCount > 0) {
                try {
                    $licenseService->assertCanAddEmployee($companyId, $inactiveCount);
                } catch (\RuntimeException $e) {
                    return response()->json(['message' => $e->getMessage()], 422);
                }
            }

            $query->update(['status' => 'active']);
        } elseif ($validated['action'] === 'deactivate') {
            $query->update(['status' => 'inactive']);
        } else {
            $query->delete();
        }

        return $this->ok(null, 'Bulk action executed successfully');
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/employees/export          (employees:export)
    //  Queues the CSV export (ExportEmployeesJob) so exporting a large
    //  headcount doesn't block the request. Returns a background_run
    //  id the frontend polls; the run's summary carries the download path.
    // ──────────────────────────────────────────────────────────────
    public function export(Request $request)
    {
        $this->authorizePermission($request, 'employees:export');

        $rows = Employee::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->department_id));

        $this->scopeToCompany($request, $rows);
        $this->applyManagedEmployeeScope($request, $rows);

        $employeeIds = $rows->pluck('id')->all();

        $run = BackgroundRun::create([
            'type'         => BackgroundRun::TYPE_EMPLOYEE_EXPORT,
            'status'       => BackgroundRun::STATUS_QUEUED,
            'company_id'   => $request->user()?->company_id,
            'requested_by' => $request->user()?->id,
        ]);

        // Run inline so it works without a queue worker; the run row still records done/failed.
        try {
            ExportEmployeesJob::dispatchSync($run->id, $employeeIds);
        } catch (\Throwable $e) {
            report($e);
        }

        return $this->ok(['background_run_id' => $run->id], 'Employee export has been queued.', 202);
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

    private function assertThisEmployeeInCompany(Request $request, Employee $employee): void
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
            $this->assertThisEmployeeInCompany($request, $employee);
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/employees/import          (employees:create)
    //  Stores the uploaded CSV and queues ImportEmployeesJob so a
    //  large file doesn't block the request. Returns a background_run
    //  id the frontend polls for progress.
    // ──────────────────────────────────────────────────────────────
    public function import(Request $request)
    {
        $this->authorizePermission($request, 'employees:create');

        $request->validate(['file' => 'required|file|mimes:csv,txt|max:2048']);

        $companyId = $request->user()?->company_id;
        $storedPath = $request->file('file')->store('imports');

        $run = BackgroundRun::create([
            'type'         => BackgroundRun::TYPE_EMPLOYEE_IMPORT,
            'status'       => BackgroundRun::STATUS_QUEUED,
            'company_id'   => $companyId,
            'requested_by' => $request->user()?->id,
        ]);

        // Run inline so it works without a queue worker; the run row still records done/failed.
        try {
            ImportEmployeesJob::dispatchSync($run->id, $storedPath, $companyId);
        } catch (\Throwable $e) {
            report($e);
        }

        return $this->ok(['background_run_id' => $run->id], 'Employee import has been queued.', 202);
    }

    private function assignRoleToUser(User $user, ?string $roleName, bool $replace = false): void
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

        $replace ? $user->syncRoles($role) : $user->assignRole($role);
    }
}