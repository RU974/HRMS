<?php

namespace App\Http\Controllers;

use App\Models\Candidate;
use Illuminate\Http\Request;

class OnboardingController extends Controller
{
    public function index(Request $request)
    {
        $query = Candidate::with('jobOpening')
            ->where('stage', 'hired')
            ->latest();

        if ($request->filled('onboarding_status')) {
            $query->where('onboarding_status', $request->onboarding_status);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('full_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%");
            });
        }

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'candidate_id' => 'required|exists:candidates,id',
            'onboarding_status' => 'required|in:pending,in_progress,completed,deferred',
            'onboarding_start_date' => 'nullable|date',
            'onboarding_notes' => 'nullable|string',
        ]);

        $candidate = Candidate::findOrFail($validated['candidate_id']);
        $candidate->update([
            'stage' => 'hired',
            'onboarding_status' => $validated['onboarding_status'],
            'onboarding_start_date' => $validated['onboarding_start_date'] ?? null,
            'onboarding_notes' => $validated['onboarding_notes'] ?? null,
        ]);

        return $this->ok($candidate->load('jobOpening'), 'Onboarding created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(Candidate::with('jobOpening')->where('stage', 'hired')->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $candidate = Candidate::findOrFail($id);
        $validated = $request->validate([
            'onboarding_status' => 'sometimes|in:pending,in_progress,completed,deferred',
            'onboarding_start_date' => 'sometimes|nullable|date',
            'onboarding_notes' => 'sometimes|nullable|string',
        ]);

        $candidate->update([
            ...$validated,
            'stage' => 'hired',
        ]);

        return $this->ok($candidate->load('jobOpening'), 'Onboarding updated successfully');
    }

    public function destroy($id)
    {
        $candidate = Candidate::findOrFail($id);
        $candidate->update([
            'onboarding_status' => null,
            'onboarding_start_date' => null,
            'onboarding_notes' => null,
        ]);

        return $this->ok($candidate->load('jobOpening'), 'Onboarding deleted successfully');
    }
}

