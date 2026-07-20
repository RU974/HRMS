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
