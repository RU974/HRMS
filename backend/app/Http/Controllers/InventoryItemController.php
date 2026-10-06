<?php

namespace App\Http\Controllers;

use App\Models\InventoryCategory;
use App\Models\InventoryItem;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryItemController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['inventory:view', 'inventory:manage_settings']);

        $query = InventoryItem::query()
            ->with('category:id,name')
            ->with(['activeAssignments' => fn ($q) => $q->with('employee:id,name')])
            ->withCount('activeAssignments')
            ->orderBy('name');

        $this->scopeToCompany($request, $query);

        if ($request->boolean('include_archived')) {
            $query->withTrashed();
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->integer('category_id'));
        }

        return $this->ok($query->get());
    }

    public function show(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['inventory:view', 'inventory:manage_settings']);

        $query = InventoryItem::query()->with([
            'category:id,name',
            'activeAssignments' => fn ($q) => $q->with('employee:id,name'),
            'assignments' => fn ($q) => $q->with('employee:id,name')->orderByDesc('assigned_date'),
        ]);
        $this->scopeToCompany($request, $query);
        $item = $query->findOrFail($id);

        return $this->ok($item);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'inventory:create');

        $companyId = $request->user()->company_id;

        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'category_id' => [
                'nullable',
                Rule::exists('inventory_categories', 'id')->when(
                    $companyId,
                    fn ($rule) => $rule->where('company_id', $companyId)
                ),
            ],
            'sku'         => [
                'nullable', 'string', 'max:100',
                Rule::unique('inventory_items', 'sku')->where('company_id', $companyId)->whereNull('deleted_at'),
            ],
            'quantity'    => ['required', 'integer', 'min:0'],
            'unit_cost'   => ['nullable', 'numeric', 'min:0'],
            'location'    => ['nullable', 'string', 'max:255'],
            'condition'   => ['nullable', Rule::in(['new', 'good', 'fair', 'poor'])],
            'description' => ['nullable', 'string'],
        ]);

        $validated['company_id']         = $companyId;
        $validated['quantity_available'] = $validated['quantity'];

        return $this->ok(InventoryItem::create($validated), 'Item created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:edit');

        $companyId = $request->user()->company_id;
        $query     = InventoryItem::query();
        $this->scopeToCompany($request, $query);
        $item      = $query->findOrFail($id);

        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'category_id' => [
                'nullable',
                Rule::exists('inventory_categories', 'id')->when(
                    $companyId,
                    fn ($rule) => $rule->where('company_id', $companyId)
                ),
            ],
            'sku'         => [
                'nullable', 'string', 'max:100',
                Rule::unique('inventory_items', 'sku')->ignore($id)->where('company_id', $companyId)->whereNull('deleted_at'),
            ],
            'quantity'    => ['required', 'integer', 'min:0'],
            'unit_cost'   => ['nullable', 'numeric', 'min:0'],
            'location'    => ['nullable', 'string', 'max:255'],
            'condition'   => ['nullable', Rule::in(['new', 'good', 'fair', 'poor'])],
            'description' => ['nullable', 'string'],
        ]);

        // Recalculate available qty based on active assignments
        $assigned = $item->activeAssignments()->sum('quantity');
        $validated['quantity_available'] = max(0, $validated['quantity'] - $assigned);

        $item->update($validated);

        return $this->ok($item->load('category:id,name'), 'Item updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:delete');

        $query = InventoryItem::query();
        $this->scopeToCompany($request, $query);
        $item  = $query->findOrFail($id);

        if ($item->activeAssignments()->exists()) {
            return $this->fail('Cannot archive item with active assignments. Return all assigned items first.', 422);
        }

        $item->delete();

        return $this->ok(null, 'Item archived successfully');
    }

    /**
     * Bulk-create items from parsed CSV rows. Valid rows are created; invalid rows
     * are reported back with their row number so the user can fix and re-upload.
     */
    public function import(Request $request)
    {
        $this->authorizePermission($request, 'inventory:create');

        $companyId = $request->user()->company_id;

        $request->validate([
            'rows'   => ['required', 'array', 'min:1', 'max:1000'],
            'rows.*' => ['array'],
        ]);

        $categories = InventoryCategory::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->get(['id', 'name'])
            ->keyBy(fn ($c) => mb_strtolower(trim($c->name)));

        $seenSkus = [];
        $created  = 0;
        $errors   = [];

        foreach ($request->input('rows') as $index => $row) {
            $line = $index + 2; // +1 for header row, +1 for 1-based numbering

            $categoryName = trim((string) ($row['category'] ?? ''));
            $categoryId   = null;
            if ($categoryName !== '') {
                $category = $categories->get(mb_strtolower($categoryName));
                if (! $category) {
                    $errors[] = ['row' => $line, 'message' => "Unknown category \"{$categoryName}\"."];
                    continue;
                }
                $categoryId = $category->id;
            }

            $data = [
                'name'        => trim((string) ($row['name'] ?? '')),
                'sku'         => ($row['sku'] ?? '') === '' ? null : trim((string) $row['sku']),
                'quantity'    => ($row['quantity'] ?? '') === '' ? 0 : $row['quantity'],
                'unit_cost'   => ($row['unit_cost'] ?? '') === '' ? 0 : $row['unit_cost'],
                'location'    => ($row['location'] ?? '') === '' ? null : (string) $row['location'],
                'condition'   => ($row['condition'] ?? '') === '' ? 'good' : mb_strtolower(trim((string) $row['condition'])),
                'description' => ($row['description'] ?? '') === '' ? null : (string) $row['description'],
            ];

            $validator = validator($data, [
                'name'        => ['required', 'string', 'max:255'],
                'sku'         => [
                    'nullable', 'string', 'max:100',
                    Rule::unique('inventory_items', 'sku')->where('company_id', $companyId)->whereNull('deleted_at'),
                ],
                'quantity'    => ['required', 'integer', 'min:0'],
                'unit_cost'   => ['nullable', 'numeric', 'min:0'],
                'location'    => ['nullable', 'string', 'max:255'],
                'condition'   => ['required', Rule::in(['new', 'good', 'fair', 'poor'])],
                'description' => ['nullable', 'string'],
            ]);

            if ($validator->fails()) {
                $errors[] = ['row' => $line, 'message' => $validator->errors()->first()];
                continue;
            }

            if ($data['sku'] !== null) {
                $key = mb_strtolower($data['sku']);
                if (isset($seenSkus[$key])) {
                    $errors[] = ['row' => $line, 'message' => "Duplicate SKU \"{$data['sku']}\" in file."];
                    continue;
                }
                $seenSkus[$key] = true;
            }

            InventoryItem::create($validator->validated() + [
                'company_id'         => $companyId,
                'category_id'        => $categoryId,
                'quantity_available' => (int) $data['quantity'],
            ]);
            $created++;
        }

        return $this->ok(
            ['created' => $created, 'failed' => count($errors), 'errors' => $errors],
            "Imported {$created} item(s)."
        );
    }

    public function restore(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:manage_settings');

        $query = InventoryItem::query();
        $this->scopeToCompany($request, $query);
        $item  = $query->withTrashed()->findOrFail($id);
        $item->restore();

        return $this->ok($item, 'Item restored successfully');
    }
}
