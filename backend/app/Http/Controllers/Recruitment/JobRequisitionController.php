<?php

namespace App\Http\Controllers\Recruitment;

use App\Models\Department;
use App\Models\JobOpening;
use App\Services\Recruitment\JobRequisitionService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Entry point for hiring managers who hold recruitment:request (or recruitment:create). A requisition
 * made here always goes through approval, whether or not the company enforces it for recruiters.
 */
class JobRequisitionController extends AbstractJobOpeningController
{
    public function __construct(private readonly JobRequisitionService $requisitions)
    {
    }

    private function authorizeRequester(Request $request): void
    {
        $this->authorizeAnyPermission($request, ['recruitment:request', 'recruitment:create']);
    }

    /** The company's departments for the requisition form; requesters cannot read the full department list. */
    public function departments(Request $request)
    {
        $this->authorizeRequester($request);

        $query = Department::query()->orderBy('name');
        $this->scopeToCompany($request, $query);

        return $this->ok($query->get(['id', 'name']));
    }

    public function mine(Request $request)
    {
        $this->authorizeRequester($request);

        $query = $this->withCounts()
            ->where('requested_by', $request->user()->id)
            ->whereIn('status', ['pending_approval', 'rejected', 'open', 'closed', 'on_hold'])
            ->latest('id');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        return $this->ok($query->paginate(min(max((int) $request->input('per_page', 15), 1), 100)));
    }

    public function store(Request $request)
    {
        $this->authorizeRequester($request);

        $validated = $request->validate(['title' => 'required|string|max:255'] + $this->sharedRules($request, 'required'));
        $this->assertSalaryRange($validated);

        $job = $this->requisitions->createRequisition([
            ...array_diff_key($validated, array_flip(['status', 'posted_at', 'closed_at'])),
            'employment_type' => $validated['employment_type'] ?? 'full_time',
            'open_positions' => $validated['open_positions'] ?? 1,
            'is_public' => (bool) ($validated['is_public'] ?? false),
        ], $request->user());

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition submitted for approval', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRequester($request);

        $job = $this->resolveTenantModel(JobOpening::class, $id);
        $this->assertOwnRequisition($request, $job);

        if ($job->status !== 'rejected') {
            throw ValidationException::withMessages(['status' => ['Only a rejected or withdrawn requisition can be edited.']]);
        }

        $validated = $request->validate(['title' => 'sometimes|string|max:255'] + $this->sharedRules($request, 'sometimes'));
        $this->assertSalaryRange($validated, $job);

        $job->update(array_diff_key($validated, array_flip(['status', 'posted_at', 'closed_at'])));

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition updated');
    }

    public function resubmit(Request $request, $id)
    {
        $this->authorizeRequester($request);

        $job = $this->resolveTenantModel(JobOpening::class, $id);
        $this->assertOwnRequisition($request, $job);

        $this->requisitions->submit($job, $request->user());

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition submitted for approval');
    }
}
