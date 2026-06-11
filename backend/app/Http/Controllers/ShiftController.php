<?php

namespace App\Http\Controllers;

use App\Models\Shift;
use Illuminate\Http\Request;

class ShiftController extends Controller
{
    public function index()
    {
        return $this->ok(Shift::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $validated = $request->validate([
            'name' => 'required|string|max:120|unique:shifts,name',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i',
            'grace_minutes' => 'nullable|integer|min:0|max:180',
            'is_active' => 'nullable|boolean',
        ]);
        $shift = Shift::create([
            ...$validated,
            'grace_minutes' => $validated['grace_minutes'] ?? 0,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return $this->ok($shift, 'Shift created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(Shift::findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $shift = Shift::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:120|unique:shifts,name,' . $id,
            'start_time' => 'sometimes|date_format:H:i',
            'end_time' => 'sometimes|date_format:H:i',
            'grace_minutes' => 'sometimes|integer|min:0|max:180',
            'is_active' => 'sometimes|boolean',
        ]);
        $shift->update($validated);

        return $this->ok($shift, 'Shift updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        Shift::findOrFail($id)->delete();
        return $this->ok(null, 'Shift deleted successfully');
    }
}
