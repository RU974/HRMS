<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\Company;
use App\Models\Offer;
use App\Services\Recruitment\CandidatePortalService;
use App\Services\Recruitment\OfferService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OfferController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly OfferService $offers)
    {
    }

    private function terms(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'salary' => "{$required}|numeric|gt:0|max:99999999",
            'currency' => 'sometimes|string|max:10',
            'start_date' => 'sometimes|nullable|date',
            'expires_at' => 'sometimes|nullable|date|after_or_equal:today',
            'benefits' => 'sometimes|nullable|array|max:30',
            'benefits.*' => 'string|max:120',
            'terms' => 'sometimes|nullable|string|max:10000',
            'additional_notes' => 'sometimes|nullable|string|max:5000',
        ]);
    }

    private function present(Offer $offer): Offer
    {
        $offer->load(['candidate:id,full_name,email,job_opening_id,stage', 'candidate.jobOpening:id,title', 'creator']);
        $offer->candidate?->setAppends([]);

        return $offer;
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $this->offers->expireStale();

        $query = Offer::with(['candidate:id,full_name,email,job_opening_id,stage', 'candidate.jobOpening:id,title', 'creator'])->latest('id');

        foreach (['status', 'candidate_id'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->input($filter));
            }
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->whereHas('candidate', fn ($candidateQuery) => $candidateQuery->where('full_name', 'like', "%{$q}%"));
        }

        $page = $query->paginate(min(max((int) $request->input('per_page', 15), 1), 100));
        $page->getCollection()->each(fn (Offer $offer) => $offer->candidate?->setAppends([]));

        return $this->ok($page);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        return $this->ok($this->present($this->resolveTenantModel(Offer::class, $id)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:create');

        $request->validate([
            'candidate_id' => ['required', Rule::exists('candidates', 'id')->where(function ($query) use ($request) {
                if ($request->user()?->company_id) {
                    $query->where('company_id', $request->user()->company_id);
                }
            })],
        ]);

        $candidate = $this->resolveTenantModel(Candidate::class, $request->input('candidate_id'));
        $data = $this->terms($request, true);

        $offer = $this->offers->create($candidate, $data, $request->user());

        return $this->ok($this->present($offer), 'Offer created', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $offer = $this->resolveTenantModel(Offer::class, $id);

        return $this->ok($this->present($this->offers->update($offer, $this->terms($request, false))), 'Offer updated');
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'recruitment:delete');

        $offer = $this->resolveTenantModel(Offer::class, $id);

        if (! in_array($offer->status, ['draft', 'rejected', 'withdrawn', 'declined', 'expired'], true)) {
            return $this->fail('Only draft, rejected, withdrawn, declined or expired offers can be deleted. Withdraw the offer first.', 422);
        }

        $offer->delete();

        return $this->ok(null, 'Offer deleted');
    }

    public function submit(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $offer = $this->resolveTenantModel(Offer::class, $id);

        return $this->ok($this->present($this->offers->submitForApproval($offer, $request->user())), 'Offer submitted for approval');
    }

    public function approve(Request $request, $id)
    {
        $offer = $this->resolveTenantModel(Offer::class, $id);
        $validated = $request->validate(['notes' => 'nullable|string|max:1024']);

        return $this->ok($this->present($this->offers->decide($offer, $request->user(), true, $validated['notes'] ?? null)), 'Offer approved');
    }

    public function reject(Request $request, $id)
    {
        $offer = $this->resolveTenantModel(Offer::class, $id);
        $validated = $request->validate(['notes' => 'required|string|max:1024']);

        return $this->ok($this->present($this->offers->decide($offer, $request->user(), false, $validated['notes'])), 'Offer rejected');
    }

    public function send(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $offer = $this->resolveTenantModel(Offer::class, $id);

        $offer = $this->offers->markSent($offer, $request->user());

        // The candidate answers online: email them a private link to the offer.
        $candidate = Candidate::query()->withoutGlobalScopes()->find($offer->candidate_id);
        $emailed = $candidate && app(CandidatePortalService::class)->sendLink(
            $candidate,
            'Your offer from ' . (Company::query()->whereKey($offer->company_id)->value('name') ?? 'our team'),
            'We are pleased to send you an offer for {{job}}. You can read it and accept or decline online.'
        );

        return $this->ok(
            $this->present($offer)->setAttribute('candidate_emailed', (bool) $emailed),
            $emailed ? 'Offer sent. The candidate was emailed a link to answer it.' : 'Offer marked as sent. Share the candidate portal link so they can answer it.'
        );
    }

    public function respond(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $offer = $this->resolveTenantModel(Offer::class, $id);
        $validated = $request->validate([
            'response' => 'required|in:accepted,declined',
            'reason' => 'nullable|string|max:1000',
        ]);

        return $this->ok(
            $this->present($this->offers->recordResponse($offer, $request->user(), $validated['response'], $validated['reason'] ?? null)),
            'Offer ' . $validated['response']
        );
    }

    public function withdraw(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $offer = $this->resolveTenantModel(Offer::class, $id);

        return $this->ok($this->present($this->offers->withdraw($offer)), 'Offer withdrawn');
    }

    public function pdf($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        $offer = $this->resolveTenantModel(Offer::class, $id);
        $name = 'offer-' . \Illuminate\Support\Str::slug($offer->candidate?->full_name ?? 'candidate') . '.pdf';

        return $this->offers->download($offer, $name);
    }

    /** Checks that a signed offer, its record and its stored letter are exactly as they were when signed. */
    public function verifySignature($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        $offer = $this->resolveTenantModel(Offer::class, $id);

        return $this->ok(app(\App\Services\Recruitment\OfferSigningService::class)->verify($offer));
    }
}
