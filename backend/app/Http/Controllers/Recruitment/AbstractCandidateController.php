<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use Illuminate\Http\Request;

abstract class AbstractCandidateController extends Controller
{
    public function index(Request $request)
    {
        $query = Candidate::with(['jobOpening', 'interviews'])->latest();

        if ($request->filled('job_opening_id')) {
            $query->where('job_opening_id', $request->job_opening_id);
        }

        if ($request->filled('stage')) {
            $query->where('stage', $request->stage);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('full_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('source', 'like', "%{$q}%");
            });
        }

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'job_opening_id' => 'required|exists:job_openings,id',
            'full_name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:50',
            'resume_path' => 'nullable|string|max:1000',
            'source' => 'nullable|string|max:120',
            'stage' => 'nullable|in:applied,screening,interview,offer,hired,rejected',
            'rating' => 'nullable|integer|min:1|max:5',
            'status' => 'nullable|in:active,inactive',
            'applied_at' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $candidate = Candidate::create([
            ...$validated,
            'stage' => $validated['stage'] ?? 'applied',
            'status' => $validated['status'] ?? 'active',
        ]);

        return $this->ok($candidate->load('jobOpening'), 'Candidate created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(Candidate::with(['jobOpening', 'interviews'])->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $candidate = Candidate::findOrFail($id);

        $validated = $request->validate([
            'job_opening_id' => 'sometimes|exists:job_openings,id',
            'full_name' => 'sometimes|string|max:255',
            'email' => 'sometimes|email|max:255',
            'phone' => 'sometimes|nullable|string|max:50',
            'resume_path' => 'sometimes|nullable|string|max:1000',
            'source' => 'sometimes|nullable|string|max:120',
            'stage' => 'sometimes|in:applied,screening,interview,offer,hired,rejected',
            'rating' => 'sometimes|nullable|integer|min:1|max:5',
            'status' => 'sometimes|in:active,inactive',
            'applied_at' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string',
        ]);

        $candidate->update($validated);

        return $this->ok($candidate->load(['jobOpening', 'interviews']), 'Candidate updated successfully');
    }

    public function destroy($id)
    {
        Candidate::findOrFail($id)->delete();

        return $this->ok(null, 'Candidate deleted successfully');
    }

    public function pipelineSummary()
    {
        $summary = Candidate::query()
            ->selectRaw('stage, COUNT(*) as count')
            ->groupBy('stage')
            ->orderBy('stage')
            ->get();

        return $this->ok($summary);
    }
}
