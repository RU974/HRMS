<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use Illuminate\Http\Request;

class HolidayController extends Controller
{
    public function index()
    {
        return $this->ok(Holiday::orderBy('holiday_date')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'holiday_date' => 'required|date|unique:holidays,holiday_date',
            'is_optional' => 'nullable|boolean',
        ]);
        $holiday = Holiday::create([
            ...$validated,
            'is_optional' => $validated['is_optional'] ?? false,
        ]);

        return $this->ok($holiday, 'Holiday created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(Holiday::findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $holiday = Holiday::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'holiday_date' => 'sometimes|date|unique:holidays,holiday_date,' . $id,
            'is_optional' => 'sometimes|boolean',
        ]);
        $holiday->update($validated);

        return $this->ok($holiday, 'Holiday updated successfully');
    }

    public function destroy($id)
    {
        Holiday::findOrFail($id)->delete();
        return $this->ok(null, 'Holiday deleted successfully');
    }
}
