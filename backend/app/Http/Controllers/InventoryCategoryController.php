<?php

namespace App\Http\Controllers;

use App\Models\InventoryCategory;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryCategoryController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['inventory:view', 'inventory:manage_settings']);

        $query = InventoryCategory::query()->withCount('items')->orderBy('name');
        $this->scopeToCompany($request, $query);
        $categories = $query->get();

        return $this->ok($categories);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'inventory:manage_settings');

        $companyId = $request->user()->company_id;

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('inventory_categories', 'name')->where('company_id', $companyId),
            ],
            'description' => ['nullable', 'string', 'max:500'],
        ]);

        $validated['company_id'] = $companyId;

        return $this->ok(InventoryCategory::create($validated), 'Category created successfully', 201);
    }

    /**
     * Bulk-create categories from parsed CSV rows. Valid rows are created; invalid or
     * duplicate rows are reported back with their row number.
     */
    public function import(Request $request)
    {
        $this->authorizePermission($request, 'inventory:manage_settings');

        $companyId = $request->user()->company_id;

        $request->validate([
            'rows'   => ['required', 'array', 'min:1', 'max:1000'],
            'rows.*' => ['array'],
        ]);

        $existing = InventoryCategory::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->pluck('name')
            ->mapWithKeys(fn ($n) => [mb_strtolower(trim($n)) => true])
            ->all();

        $created = 0;
        $errors  = [];

        foreach ($request->input('rows') as $index => $row) {
            $line = $index + 2; // +1 for header row, +1 for 1-based numbering

            $data = [
                'name'        => trim((string) ($row['name'] ?? '')),
                'description' => ($row['description'] ?? '') === '' ? null : trim((string) $row['description']),
            ];

            $validator = validator($data, [
                'name'        => ['required', 'string', 'max:255'],
                'description' => ['nullable', 'string', 'max:500'],
            ]);

            if ($validator->fails()) {
                $errors[] = ['row' => $line, 'message' => $validator->errors()->first()];
                continue;
            }

            $key = mb_strtolower($data['name']);
            if (isset($existing[$key])) {
                $errors[] = ['row' => $line, 'message' => "Category \"{$data['name']}\" already exists."];
                continue;
            }
            $existing[$key] = true;

            InventoryCategory::create($validator->validated() + ['company_id' => $companyId]);
            $created++;
        }

        return $this->ok(
            ['created' => $created, 'failed' => count($errors), 'errors' => $errors],
            "Imported {$created} category(ies)."
        );
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:manage_settings');

        $companyId = $request->user()->company_id;
        $query     = InventoryCategory::query();
        $this->scopeToCompany($request, $query);
        $category  = $query->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('inventory_categories', 'name')->ignore($id)->where('company_id', $companyId),
            ],
            'description' => ['nullable', 'string', 'max:500'],
        ]);

        $category->update($validated);

        return $this->ok($category, 'Category updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:manage_settings');

        $query    = InventoryCategory::query()->withCount('items');
        $this->scopeToCompany($request, $query);
        $category = $query->findOrFail($id);

        if ($category->items_count > 0) {
            return $this->fail('Cannot delete category with existing items. Reassign items first.', 422, ['items_count' => $category->items_count]);
        }

        $category->delete();

        return $this->ok(null, 'Category deleted successfully');
    }
}
