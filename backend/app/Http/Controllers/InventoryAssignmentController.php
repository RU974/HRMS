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

        $item = InventoryItem::findOrFail($validated['item_id']);

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

    public function return(Request $request, $id)
    {
        $this->authorizePermission($request, 'inventory:edit');

        $assignment = InventoryAssignment::with('item')->findOrFail($id);

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
