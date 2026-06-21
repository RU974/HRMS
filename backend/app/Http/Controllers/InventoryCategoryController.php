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

        $categories = InventoryCategory::query()
            ->withCount('items')
            ->orderBy('name')
            ->get();

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

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:manage_settings');

        $companyId = $request->user()->company_id;
        $category = InventoryCategory::findOrFail($id);

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

        $category = InventoryCategory::withCount('items')->findOrFail($id);

        if ($category->items_count > 0) {
            return $this->fail('Cannot delete category with existing items. Reassign items first.', 422, ['items_count' => $category->items_count]);
        }

        $category->delete();

        return $this->ok(null, 'Category deleted successfully');
    }
}
