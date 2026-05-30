<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Models\Interview;
use Illuminate\Http\Request;

class InterviewController extends Controller
{
    public function index(Request $request)
    {
        $query = Interview::with('candidate')->orderBy('scheduled_at', 'desc');

        if ($request->filled('candidate_id')) {
            $query->where('candidate_id', $request->candidate_id);
        }

        if ($request->filled('result')) {
            $query->where('result', $request->result);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('interviewer_name', 'like', "%{$q}%")
                    ->orWhereHas('candidate', function ($candidateQuery) use ($q) {
                        $candidateQuery->where('full_name', 'like', "%{$q}%");
                    });
            });
        }

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'candidate_id' => 'required|exists:candidates,id',
            'interviewer_name' => 'required|string|max:255',
            'interview_type' => 'nullable|in:screening,technical,behavioral,managerial,hr',
            'scheduled_at' => 'required|date',
            'result' => 'nullable|in:pending,pass,fail,hold',
            'feedback' => 'nullable|string',
        ]);

        $interview = Interview::create([
            ...$validated,
            'interview_type' => $validated['interview_type'] ?? 'technical',
            'result' => $validated['result'] ?? 'pending',
        ]);

        return $this->ok($interview->load('candidate'), 'Interview scheduled successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(Interview::with('candidate')->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $interview = Interview::findOrFail($id);

        $validated = $request->validate([
            'candidate_id' => 'sometimes|exists:candidates,id',
            'interviewer_name' => 'sometimes|string|max:255',
            'interview_type' => 'sometimes|in:screening,technical,behavioral,managerial,hr',
            'scheduled_at' => 'sometimes|date',
            'result' => 'sometimes|in:pending,pass,fail,hold',
            'feedback' => 'sometimes|nullable|string',
        ]);

        $interview->update($validated);

        return $this->ok($interview->load('candidate'), 'Interview updated successfully');
    }

    public function destroy($id)
    {
        Interview::findOrFail($id)->delete();

        return $this->ok(null, 'Interview deleted successfully');
    }
}
