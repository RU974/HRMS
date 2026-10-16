<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit', 'recruitment:view']);

        $query = Department::query()->with('head:id,name')->withCount('employees')->orderBy('name');
        $this->scopeToCompany($request, $query);
        if ($request->boolean('include_archived')) {
            $query->withTrashed();
        }

        return $this->ok($query->get());
    }

    // GET /departments/export — CSV of this company's departments.
    public function export(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $query = Department::query()->withCount('employees')->orderBy('name');
        $this->scopeToCompany($request, $query);

        return response()->streamDownload(function () use ($query): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['name', 'employees']);
            foreach ($query->cursor() as $row) {
                fputcsv($out, [$row->name, $row->employees_count]);
            }
            fclose($out);
        }, 'departments-' . now()->toDateString() . '.csv', ['Content-Type' => 'text/csv']);
    }

    // POST /departments/import — CSV with a "name" column. Names that already exist are skipped.
    public function import(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:2048']);

        $handle = fopen($request->file('file')->getRealPath(), 'r');
        $header = $handle ? fgetcsv($handle) : false;
        if (!$header) {
            return $this->fail('The CSV file is empty.', 422);
        }
        $header = array_map(fn ($h) => strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), $header);
        $nameIdx = array_search('name', $header, true);
        if ($nameIdx === false) {
            return $this->fail('Missing required column: name.', 422);
        }

        $companyId = $request->user()->company_id;
        $existingQuery = Department::query();
        $this->scopeToCompany($request, $existingQuery);
        $seen = $existingQuery->pluck('name')->mapWithKeys(fn ($n) => [mb_strtolower(trim((string) $n)) => true])->all();

        $imported = 0;
        $skipped = 0;
        $errors = [];
        $line = 1;

        while (($cols = fgetcsv($handle)) !== false) {
            $line++;
            $name = trim((string) ($cols[$nameIdx] ?? ''));
            if ($name === '' && count(array_filter($cols, fn ($c) => trim((string) $c) !== '')) === 0) {
                continue;
            }
            if ($name === '' || mb_strlen($name) > 255) {
                $errors[] = "Line {$line}: name is required (max 255 characters).";
                $skipped++;
                continue;
            }
            $key = mb_strtolower($name);
            if (isset($seen[$key])) {
                $errors[] = "Line {$line}: '{$name}' already exists.";
                $skipped++;
                continue;
            }
            Department::create(['name' => $name, 'company_id' => $companyId]);
            $seen[$key] = true;
            $imported++;
        }
        fclose($handle);

        return $this->ok(
            ['imported' => $imported, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 50)],
            "Imported {$imported} department(s), skipped {$skipped}."
        );
    }

    public function show(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit', 'recruitment:view']);

        $query = Department::query()->with('employees');
        $this->scopeToCompany($request, $query);
        return $this->ok($query->findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $companyId = $request->user()->company_id;

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('departments', 'name')
                    ->where('company_id', $companyId)
                    ->whereNull('deleted_at'),
            ],
            'head_employee_id' => $this->headRule($companyId),
        ]);

        $validated['company_id'] = $companyId;

        return $this->ok(Department::create($validated), 'Department created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $companyId  = $request->user()->company_id;
        $query      = Department::query();
        $this->scopeToCompany($request, $query);
        $department = $query->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('departments', 'name')
                    ->ignore($id)
                    ->where('company_id', $companyId)
                    ->whereNull('deleted_at'),
            ],
            'head_employee_id' => $this->headRule($companyId),
        ]);

        $department->update($validated);

        return $this->ok($department, 'Department updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $query = Department::query();
        $this->scopeToCompany($request, $query);
        $query->findOrFail($id)->delete();
        return $this->ok(message: 'Department archived successfully');
    }

    public function restore(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $query      = Department::query();
        $this->scopeToCompany($request, $query);
        $department = $query->withTrashed()->findOrFail($id);
        $department->restore();
        return $this->ok($department, 'Department restored successfully');
    }

    public function reassignEmployees(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:edit');

        $source = Department::findOrFail($id);

        $companyId = $request->user()->company_id;
        $existsRule = Rule::exists('departments', 'id');
        if ($companyId) {
            $existsRule->where('company_id', $companyId);
        }

        $validated = $request->validate([
            'target_department_id' => ['required', $existsRule],
        ]);

        if ((int) $validated['target_department_id'] === (int) $source->id) {
            return $this->fail('Target department must be different from source department.', 422);
        }

        $moved = Employee::where('department_id', $source->id)->update(['department_id' => $validated['target_department_id']]);

        return $this->ok(['moved' => $moved], 'Employees reassigned successfully');
    }

    public function forceDelete(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $query      = Department::query();
        $this->scopeToCompany($request, $query);
        $department = $query->withTrashed()->findOrFail($id);
        $activeEmployees = Employee::where('department_id', $department->id)->count();

        if ($activeEmployees > 0) {
            return $this->fail('Cannot force delete department with assigned employees. Reassign employees first.', 422, ['employee_count' => $activeEmployees]);
        }

        $department->forceDelete();

        return $this->ok(null, 'Department permanently deleted successfully');
    }

    /** The head must be an employee of the same company (or empty). */
    private function headRule($companyId): array
    {
        return ['nullable', 'integer', Rule::exists('employees', 'id')->where('company_id', $companyId)];
    }
}
