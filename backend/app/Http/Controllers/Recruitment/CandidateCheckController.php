<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\CandidateCheck;
use App\Services\Recruitment\CandidateCheckService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Reference checks, background checks and assessments of a candidate. */
class CandidateCheckController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly CandidateCheckService $checks)
    {
    }

    private function rules(bool $creating): array
    {
        $presence = $creating ? 'required' : 'sometimes';

        return [
            'type' => [$presence, Rule::in(CandidateCheck::TYPES)],
            'title' => [$presence, 'string', 'max:200'],
            'status' => ['sometimes', Rule::in(array_diff(CandidateCheck::STATUSES, ['waived']))],
            'provider' => 'sometimes|nullable|string|max:160',
            'contact_name' => 'sometimes|nullable|string|max:160',
            'contact_email' => 'sometimes|nullable|email:rfc|max:255',
            'contact_phone' => 'sometimes|nullable|string|max:50',
            'relationship' => 'sometimes|nullable|string|max:160',
            'due_on' => 'sometimes|nullable|date',
            'score' => 'sometimes|nullable|numeric|min:0|max:1000000',
            'max_score' => 'sometimes|nullable|numeric|min:0|max:1000000',
            'pass_mark' => 'sometimes|nullable|numeric|min:0|max:1000000',
            'result_notes' => 'sometimes|nullable|string|max:5000',
            'document_id' => 'sometimes|nullable|integer',
        ];
    }

    private function check(Request $request, $id): CandidateCheck
    {
        return $this->resolveTenantModel(CandidateCheck::class, $id);
    }

    private function payload(Candidate $candidate): array
    {
        return [
            'checks' => $candidate->checks()->withoutGlobalScopes()->with('document:id,label')->get(),
            'summary' => $this->checks->summary($candidate),
        ];
    }

    public function index(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok($this->payload($this->resolveTenantModel(Candidate::class, $id)));
    }

    public function store(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $validated = $request->validate($this->rules(true) + ['send_request' => 'sometimes|boolean']);

        if ($validated['type'] === 'reference' && ! empty($validated['send_request']) && ! filled($validated['contact_email'] ?? null)) {
            return $this->fail('Add the referee\'s email address to send the request.', 422, ['contact_email' => ['The referee\'s email address is required.']]);
        }

        $this->checks->assertDocumentBelongs($candidate->id, $validated['document_id'] ?? null);

        $check = new CandidateCheck(collect($validated)->except(['send_request', 'status'])->all());
        $check->company_id = $candidate->company_id;
        $check->candidate_id = $candidate->id;
        $check->status = 'requested';
        $check->requested_by = $request->user()?->id;
        $check->requested_at = now();
        $check->save();

        if (isset($validated['status']) || isset($validated['score'])) {
            $this->checks->apply($check, collect($validated)->only(['status', 'score'])->all(), $request->user());
        }

        $delivery = null;
        if (! empty($validated['send_request']) && $check->type === 'reference') {
            $delivery = $this->checks->sendReferenceRequest($check, $request->user());
        }

        return $this->ok($this->payload($candidate) + ['created_id' => $check->id, 'email_sent' => $delivery['sent'] ?? null], 'Check added', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $check = $this->check($request, $id);
        $validated = $request->validate($this->rules(false));

        if ($check->status === 'waived' && isset($validated['status'])) {
            return $this->fail('Reopen a waived check by deleting the waiver; it cannot be changed to another status here.', 422);
        }

        $this->checks->apply($check, $validated, $request->user());

        return $this->ok($this->payload($this->resolveTenantModel(Candidate::class, $check->candidate_id)), 'Check updated');
    }

    public function waive(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings', 'Only users who manage recruitment settings can waive a check.');

        $check = $this->check($request, $id);
        $validated = $request->validate(['reason' => 'required|string|min:5|max:500']);

        $this->checks->waive($check, $validated['reason'], $request->user());

        return $this->ok($this->payload($this->resolveTenantModel(Candidate::class, $check->candidate_id)), 'Check waived');
    }

    public function sendRequest(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $check = $this->check($request, $id);
        $delivery = $this->checks->sendReferenceRequest($check, $request->user());

        return $this->ok(
            $this->payload($this->resolveTenantModel(Candidate::class, $check->candidate_id)) + ['email_sent' => $delivery['sent']],
            $delivery['sent'] ? 'Reference request sent' : 'The request was created but the email could not be sent'
        );
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:delete');

        $check = $this->check($request, $id);
        $candidate = $this->resolveTenantModel(Candidate::class, $check->candidate_id);
        $check->delete();

        return $this->ok($this->payload($candidate), 'Check removed');
    }
}
