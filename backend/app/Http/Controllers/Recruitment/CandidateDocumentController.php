<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Services\Recruitment\CandidateDocumentService;
use App\Services\Recruitment\CandidatePortalService;
use Illuminate\Http\Request;

/** Staff side of candidate documents: ask for them, upload on a candidate's behalf, review, download. */
class CandidateDocumentController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly CandidateDocumentService $documents)
    {
    }

    private function document(Candidate $candidate, int|string $documentId): CandidateDocument
    {
        return $candidate->documents()->whereKey($documentId)->firstOrFail();
    }

    public function index(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        return $this->ok($candidate->documents()->with(['requester', 'reviewer'])->get());
    }

    public function requestDocuments(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $validated = $request->validate([
            'labels' => 'required|array|min:1|max:10',
            'labels.*' => 'required|string|max:120',
            'notify' => 'sometimes|boolean',
        ]);

        $created = $this->documents->request($candidate, $validated['labels'], $request->user()?->id);

        $emailed = false;
        if ($created->isNotEmpty() && ($validated['notify'] ?? true)) {
            $emailed = app(CandidatePortalService::class)->sendLink(
                $candidate,
                'Documents requested for your application',
                "To move your application for {{job}} forward, please upload the following in your candidate page:\n- " . $created->pluck('label')->implode("\n- ")
            );
        }

        return $this->ok([
            'documents' => $candidate->documents()->with(['requester', 'reviewer'])->get(),
            'created' => $created->count(),
            'emailed' => $emailed,
        ], $created->isEmpty() ? 'Those documents were already requested' : 'Documents requested', 201);
    }

    public function store(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $validated = $request->validate([
            'file' => CandidateDocumentService::VALIDATION_RULES,
            'document_id' => 'nullable|integer',
            'label' => 'required_without:document_id|nullable|string|max:120',
        ]);

        $document = ! empty($validated['document_id']) ? $this->document($candidate, $validated['document_id']) : null;

        return $this->ok(
            $this->documents->store($candidate, $request->file('file'), $document, $validated['label'] ?? null, 'staff')->load(['requester', 'reviewer']),
            'Document uploaded',
            201
        );
    }

    public function review(Request $request, $id, $documentId)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $validated = $request->validate([
            'status' => 'required|in:verified,rejected',
            'note' => 'nullable|string|max:1000',
        ]);

        $document = $this->documents->review($this->document($candidate, $documentId), $validated['status'], $validated['note'] ?? null, $request->user()->id);

        return $this->ok($document->load(['requester', 'reviewer']), 'Document ' . $validated['status']);
    }

    public function download(Request $request, $id, $documentId)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        return $this->documents->respond($this->document($candidate, $documentId));
    }

    public function destroy(Request $request, $id, $documentId)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit', 'recruitment:delete']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $this->documents->delete($this->document($candidate, $documentId));

        return $this->ok(null, 'Document removed');
    }
}
