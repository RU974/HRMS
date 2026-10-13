<?php

namespace App\Http\Controllers;

use App\Models\Designation;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DesignationController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit']);

        $query = Designation::query();
        $this->scopeToCompany($request, $query);
        return $this->ok($query->orderBy('name')->get());
    }

    // GET /designations/export — CSV of this company's designations.
    public function export(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $query = Designation::query()->orderBy('name');
        $this->scopeToCompany($request, $query);

        return response()->streamDownload(function () use ($query): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['name']);
            foreach ($query->cursor() as $row) {
                fputcsv($out, [$row->name]);
            }
            fclose($out);
        }, 'designations-' . now()->toDateString() . '.csv', ['Content-Type' => 'text/csv']);
    }

    // POST /designations/import — CSV with a "name" column. Names that already exist are skipped.
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
        $existingQuery = Designation::query();
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
            Designation::create(['name' => $name, 'company_id' => $companyId]);
            $seen[$key] = true;
            $imported++;
        }
        fclose($handle);

        return $this->ok(
            ['imported' => $imported, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 50)],
            "Imported {$imported} designation(s), skipped {$skipped}."
        );
    }

    public function show(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit']);

        $query = Designation::query();
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
                Rule::unique('designations', 'name')->where('company_id', $companyId),
            ],
        ]);

        $validated['company_id'] = $companyId;

        return $this->ok(Designation::create($validated), 'Designation created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $companyId   = $request->user()->company_id;
        $query       = Designation::query();
        $this->scopeToCompany($request, $query);
        $designation = $query->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('designations', 'name')->ignore($id)->where('company_id', $companyId),
            ],
        ]);

        $designation->update($validated);

        return $this->ok($designation, 'Designation updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $query       = Designation::query();
        $this->scopeToCompany($request, $query);
        $designation = $query->findOrFail($id);
        $inUse       = Employee::where('designation_id', $designation->id)->count();

        if ($inUse > 0) {
            return $this->fail('Designation cannot be deleted because it is assigned to employees.', 422, ['employee_count' => $inUse]);
        }

        $designation->delete();

        return $this->ok(null, 'Designation deleted successfully');
    }
}
