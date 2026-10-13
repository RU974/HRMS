<?php

namespace App\Http\Controllers;

use App\Models\InventoryAssignment;
use App\Models\InventoryItem;
use Illuminate\Http\Request;

class InventoryAssignmentController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['inventory:view', 'inventory:manage_settings']);

        $query = InventoryAssignment::with([
            'item:id,name,sku',
            'employee:id,name',
        ])->orderByDesc('assigned_date');
        $this->scopeToCompany($request, $query, 'employee.user');

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('item_id')) {
            $query->where('item_id', $request->integer('item_id'));
        }

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->integer('employee_id'));
        }

        return $this->ok($query->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'inventory:create');

        $validated = $request->validate([
            'item_id'       => ['required', 'exists:inventory_items,id'],
            'employee_id'   => ['required', 'exists:employees,id'],
            'quantity'      => ['required', 'integer', 'min:1'],
            'assigned_date' => ['required', 'date'],
            'notes'         => ['nullable', 'string'],
        ]);

        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $item = InventoryItem::findOrFail($validated['item_id']);
        if ($item->company_id !== $request->user()->company_id) {
            abort(403, 'You are not authorized to assign this item.');
        }

        if ($item->quantity_available < $validated['quantity']) {
            return $this->fail(
                "Only {$item->quantity_available} unit(s) available for assignment.",
                422,
                ['quantity_available' => $item->quantity_available]
            );
        }

        $assignment = InventoryAssignment::create(array_merge($validated, ['status' => 'assigned']));

        // Decrement available
        $item->decrement('quantity_available', $validated['quantity']);

        return $this->ok(
            $assignment->load(['item:id,name,sku', 'employee:id,name']),
            'Item assigned successfully',
            201
        );
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:edit');

        $assignment = InventoryAssignment::with('item')->findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $assignment->employee_id);

        $returned = $assignment->status === 'returned';

        $rules = [
            'assigned_date' => ['required', 'date'],
            'notes'         => ['nullable', 'string'],
        ];
        if ($returned) {
            $rules['returned_date'] = ['required', 'date', 'after_or_equal:assigned_date'];
        } else {
            $rules['employee_id'] = ['required', 'exists:employees,id'];
            $rules['quantity']    = ['required', 'integer', 'min:1'];
        }
        $validated = $request->validate($rules);

        if (! $returned) {
            $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

            // Stock only changes while the item is still out with the employee.
            $diff = (int) $validated['quantity'] - (int) $assignment->quantity;
            if ($diff > 0 && $assignment->item->quantity_available < $diff) {
                return $this->fail(
                    "Only {$assignment->item->quantity_available} additional unit(s) available.",
                    422,
                    ['quantity_available' => $assignment->item->quantity_available]
                );
            }
            if ($diff !== 0) {
                $assignment->item->decrement('quantity_available', $diff);
            }
        }

        $assignment->update($validated);

        return $this->ok(
            $assignment->load(['item:id,name,sku', 'employee:id,name']),
            'Assignment updated successfully'
        );
    }

    public function return(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:edit');

        $assignment = InventoryAssignment::with('item')->findOrFail($id);

        $this->assertEmployeeInCompany($request, (int) $assignment->employee_id);

        if ($assignment->status === 'returned') {
            return $this->fail('This assignment has already been returned.', 422);
        }

        $validated = $request->validate([
            'returned_date' => ['required', 'date'],
            'notes'         => ['nullable', 'string'],
        ]);

        $assignment->update(array_merge($validated, ['status' => 'returned']));

        // Restore available quantity
        $assignment->item->increment('quantity_available', $assignment->quantity);

        return $this->ok(
            $assignment->load(['item:id,name,sku', 'employee:id,name']),
            'Item returned successfully'
        );
    }
}
