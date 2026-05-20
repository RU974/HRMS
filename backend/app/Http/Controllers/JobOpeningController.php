<?php

namespace App\Http\Controllers;

use App\Models\JobOpening;
use Illuminate\Http\Request;

class JobOpeningController extends Controller
{
    public function index(Request $request)
    {
        $query = JobOpening::with('department')->latest();
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'department_id' => 'nullable|exists:departments,id',
            'employment_type' => 'nullable|in:full_time,part_time,contract,internship',
            'location' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|in:open,closed,on_hold',
            'open_positions' => 'nullable|integer|min:1|max:1000',
            'posted_at' => 'nullable|date',
            'closed_at' => 'nullable|date|after_or_equal:posted_at',
        ]);

        $job = JobOpening::create([
            ...$validated,
            'employment_type' => $validated['employment_type'] ?? 'full_time',
            'status' => $validated['status'] ?? 'open',
            'open_positions' => $validated['open_positions'] ?? 1,
        ]);

        return $this->ok($job->load('department'), 'Job opening created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(JobOpening::with(['department', 'candidates'])->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $job = JobOpening::findOrFail($id);
        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'department_id' => 'sometimes|nullable|exists:departments,id',
            'employment_type' => 'sometimes|in:full_time,part_time,contract,internship',
            'location' => 'sometimes|nullable|string|max:255',
            'description' => 'sometimes|nullable|string',
            'status' => 'sometimes|in:open,closed,on_hold',
            'open_positions' => 'sometimes|integer|min:1|max:1000',
            'posted_at' => 'sometimes|nullable|date',
            'closed_at' => 'sometimes|nullable|date',
        ]);
        $job->update($validated);

        return $this->ok($job->load('department'), 'Job opening updated successfully');
    }

    public function destroy($id)
    {
        JobOpening::findOrFail($id)->delete();
        return $this->ok(null, 'Job opening deleted successfully');
    }
}
