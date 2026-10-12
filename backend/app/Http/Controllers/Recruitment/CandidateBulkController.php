<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Jobs\RunCandidateBulkAction;
use App\Models\CandidateBulkRun;
use App\Models\JobOpening;
use App\Services\Recruitment\CandidateBulkRunService;
use App\Services\Recruitment\CandidateBulkService;
use App\Services\Recruitment\CandidateFilter;
use App\Services\Recruitment\CandidateImportService;
use App\Services\Recruitment\CandidateWorkflowService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CandidateBulkController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(
        private readonly CandidateBulkService $bulk,
        private readonly CandidateImportService $import,
        private readonly CandidateBulkRunService $runs,
    ) {
    }

    public function apply(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $validated = $request->validate([
            'ids' => 'required_without:select_all|array|min:1|max:' . CandidateBulkService::MAX_CANDIDATES,
            'ids.*' => 'integer',
            // Everything matching a filter, wherever it is in the list; unticked ids are left out.
            'select_all' => 'required_without:ids|array',
            'select_all.filters' => 'exclude_without:select_all|present|array',
            'select_all.exclude_ids' => 'sometimes|array|max:5000',
            'select_all.exclude_ids.*' => 'integer',
            'action' => ['required', Rule::in(CandidateBulkService::ACTIONS)],
            'stage' => ['required_if:action,move', Rule::in(CandidateWorkflowService::STAGES)],
            'reason' => 'required_if:action,reject|nullable|string|max:1000',
            'tags' => 'required_if:action,tag,untag|nullable|array|min:1|max:20',
            'tags.*' => 'string|max:40',
            'pool' => 'required_if:action,talent_pool|nullable|in:silver_medalist,general',
            'talent_pool' => 'nullable|in:silver_medalist,general',
            'note' => 'nullable|string|max:1000',
            'subject' => 'required_if:action,email|nullable|string|max:200',
            'body' => 'required_if:action,email|nullable|string|max:5000',
        ]);

        if (isset($validated['select_all'])) {
            $filters = array_intersect_key($validated['select_all']['filters'], array_flip(CandidateFilter::KEYS));
            $started = $this->runs->start($request->user(), $validated['action'], $validated, $filters, $validated['select_all']['exclude_ids'] ?? []);

            if ($started['mode'] === 'inline') {
                return $this->ok($started['result'] + ['run' => null], sprintf('%d of %d candidates updated', count($started['result']['succeeded']), $started['result']['requested']));
            }

            RunCandidateBulkAction::dispatchAfterResponse($started['run']->id);

            return $this->ok(['run' => $this->runs->present($started['run'])], 'Working on ' . $started['run']->total . ' candidates', 202);
        }

        if ($validated['action'] === 'email' && count($validated['ids']) > CandidateBulkService::MAX_EMAILS) {
            return $this->fail('Email at most ' . CandidateBulkService::MAX_EMAILS . ' candidates at a time.', 422, ['ids' => ['Select fewer candidates.']]);
        }

        $result = $this->bulk->run($validated['ids'], $validated['action'], $validated, $request->user());

        $message = sprintf('%d of %d candidates updated', count($result['succeeded']), $result['requested']);

        return $this->ok($result, $message);
    }

    /** Progress of a filter-wide action; only the person who started it can follow it. */
    public function run(Request $request, $run)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $record = CandidateBulkRun::query()->withoutGlobalScopes()->findOrFail($run);
        abort_unless((int) $record->user_id === (int) $request->user()->id, 404);

        return $this->ok($this->runs->present($record));
    }

    public function import(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:create');

        $validated = $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:2048',
            'job_opening_id' => ['required', Rule::exists('job_openings', 'id')->where(function ($query) use ($request) {
                if ($request->user()?->company_id) {
                    $query->where('company_id', $request->user()->company_id);
                }
            })],
            'dry_run' => 'sometimes|boolean',
        ]);

        $job = $this->resolveTenantModel(JobOpening::class, $validated['job_opening_id']);
        $dryRun = (bool) ($validated['dry_run'] ?? false);

        $result = $this->import->run($request->file('file'), $job, $request->user(), $dryRun);

        return $this->ok($result, $dryRun ? 'Preview ready' : sprintf('%d candidates imported', $result['created']));
    }
}
