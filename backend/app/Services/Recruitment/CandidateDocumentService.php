<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateDocument;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Documents that recruiters ask a candidate for (ID, degree, references...) and that the
 * candidate uploads. Files sit on the private disk and are served only through authenticated
 * staff endpoints or the candidate's own portal token.
 */
class CandidateDocumentService
{
    public const DISK = 'local';

    public const DIRECTORY = 'recruitment/documents';

    public const VALIDATION_RULES = 'required|file|mimes:pdf,jpg,jpeg,png,doc,docx|max:5120';

    public const MAX_PER_CANDIDATE = 20;

    /**
     * @param  array<int, string>  $labels
     * @return \Illuminate\Support\Collection<int, CandidateDocument>
     */
    public function request(Candidate $candidate, array $labels, ?int $requesterId): \Illuminate\Support\Collection
    {
        $created = collect();

        foreach (array_unique(array_map('trim', $labels)) as $label) {
            if ($label === '') {
                continue;
            }

            // Asking twice for the same thing is a no-op unless the first attempt was rejected.
            $open = $this->query($candidate)
                ->whereRaw('LOWER(label) = ?', [mb_strtolower($label)])
                ->whereIn('status', ['requested', 'uploaded', 'verified'])
                ->exists();

            if ($open) {
                continue;
            }

            $this->assertRoom($candidate);

            $created->push(CandidateDocument::create([
                'company_id' => $candidate->company_id,
                'candidate_id' => $candidate->id,
                'label' => mb_substr($label, 0, 120),
                'status' => 'requested',
                'requested_by' => $requesterId,
            ]));
        }

        return $created;
    }

    /**
     * Attach a file. When $document is given (a pending request) it is fulfilled, otherwise a new
     * row is created with the supplied label.
     */
    public function store(Candidate $candidate, UploadedFile $file, ?CandidateDocument $document, ?string $label, string $uploadedBy): CandidateDocument
    {
        if ($document && ! in_array($document->status, ['requested', 'rejected', 'uploaded'], true)) {
            throw ValidationException::withMessages(['document' => ['This document has already been verified.']]);
        }

        if (! $document) {
            $this->assertRoom($candidate);
        }

        $path = $file->store(self::DIRECTORY . '/' . ($candidate->company_id ?? 'shared'), self::DISK);
        $previous = $document?->file_path;

        $attributes = [
            'status' => 'uploaded',
            'file_path' => $path,
            'original_name' => mb_substr($file->getClientOriginalName(), 0, 250),
            'mime_type' => $file->getClientMimeType(),
            'size' => $file->getSize(),
            'uploaded_by_type' => $uploadedBy,
            'uploaded_at' => now(),
            'review_note' => null,
            'reviewed_by' => null,
        ];

        if ($document) {
            $document->update($attributes);
        } else {
            $document = CandidateDocument::create($attributes + [
                'company_id' => $candidate->company_id,
                'candidate_id' => $candidate->id,
                'label' => mb_substr(trim((string) $label) !== '' ? trim((string) $label) : pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME), 0, 120),
            ]);
        }

        if ($previous) {
            Storage::disk(self::DISK)->delete($previous);
        }

        return $document;
    }

    public function review(CandidateDocument $document, string $status, ?string $note, int $reviewerId): CandidateDocument
    {
        if ($document->status === 'requested' || ! $document->file_path) {
            throw ValidationException::withMessages(['status' => ['There is no uploaded file to review yet.']]);
        }

        if ($status === 'rejected' && ! filled($note)) {
            throw ValidationException::withMessages(['note' => ['Tell the candidate what is wrong with the document.']]);
        }

        $document->update(['status' => $status, 'review_note' => filled($note) ? trim($note) : null, 'reviewed_by' => $reviewerId]);

        return $document;
    }

    public function delete(CandidateDocument $document): void
    {
        if ($document->file_path) {
            Storage::disk(self::DISK)->delete($document->file_path);
        }

        $document->delete();
    }

    public function respond(CandidateDocument $document): Response
    {
        if (! $document->file_path || ! Storage::disk(self::DISK)->exists($document->file_path)) {
            abort(404, 'No file has been uploaded for this document.');
        }

        return Storage::disk(self::DISK)->download($document->file_path, $document->original_name ?: ($document->label . '.' . pathinfo($document->file_path, PATHINFO_EXTENSION)));
    }

    /** Unscoped on purpose: the candidate portal calls this without a signed-in user. */
    private function query(Candidate $candidate)
    {
        return CandidateDocument::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id);
    }

    private function assertRoom(Candidate $candidate): void
    {
        if ($this->query($candidate)->count() >= self::MAX_PER_CANDIDATE) {
            throw ValidationException::withMessages(['document' => ['A candidate can have at most ' . self::MAX_PER_CANDIDATE . ' documents.']]);
        }
    }
}
