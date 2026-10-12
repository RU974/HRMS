<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\Company;
use App\Models\JobOpening;
use App\Models\License;
use App\Services\Recruitment\CandidatePortalService;
use App\Services\Recruitment\CandidateWorkflowService;
use App\Services\Recruitment\RecruitmentNotificationService;
use App\Services\Recruitment\ResumeStorageService;
use App\Services\Recruitment\ScreeningQuestionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Unauthenticated careers site. The company is resolved from its public slug only and
 * nothing internal (ids of users, notes, ratings, stages) is ever returned.
 */
class CareersController extends Controller
{
    private function company(string $slug): Company
    {
        $company = Company::query()
            ->where('careers_slug', strtolower($slug))
            ->where('careers_enabled', true)
            ->where('is_active', true)
            ->first();

        // A company without a recruitment license behaves as if it has no careers page.
        abort_unless($company && $this->hasRecruitmentLicense($company), 404, 'This careers page is not available.');

        return $company;
    }

    private function hasRecruitmentLicense(Company $company): bool
    {
        $graceDays = (int) config('licenses.grace_days', 7);

        $license = License::query()
            ->where('company_id', $company->id)
            ->where('is_active', true)
            ->where(function ($query) use ($graceDays) {
                $query->whereIn('status', ['active', 'trial'])
                    ->orWhere(fn ($expired) => $expired->where('status', 'expired')->where('expires_at', '>=', now()->subDays($graceDays)));
            })
            ->orderByDesc('activated_at')
            ->first();

        return $license && in_array('recruitment', array_map('strtolower', (array) $license->features), true);
    }

    private function openPublicJobs(Company $company)
    {
        return JobOpening::query()
            ->withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->where('is_public', true)
            ->where('status', 'open');
    }

    private function present(JobOpening $job, bool $detail = false): array
    {
        $data = [
            'id' => $job->id,
            'title' => $job->title,
            'department' => $job->department?->name,
            'location' => $job->location,
            'employment_type' => $job->employment_type,
            'posted_at' => $job->posted_at?->toDateString(),
            'salary_min' => $job->salary_min,
            'salary_max' => $job->salary_max,
            'salary_currency' => $job->salary_currency,
        ];

        if ($detail) {
            $data['description'] = $job->description;
            $data['requirements'] = $job->requirements;
            // The applicant sees the questions but never the knockout rules behind them.
            $screening = app(ScreeningQuestionService::class);
            $data['questions'] = $screening->presentPublic($screening->forJob($job->id));
        }

        return $data;
    }

    public function company_profile(string $slug)
    {
        $company = $this->company($slug);

        return $this->ok([
            'company' => [
                'name' => $company->name,
                'logo_url' => $company->logo_url,
                'intro' => $company->careers_intro,
            ],
            'jobs' => $this->openPublicJobs($company)
                ->with('department:id,name')
                ->latest('id')
                ->get()
                ->map(fn (JobOpening $job) => $this->present($job))
                ->values(),
        ]);
    }

    public function job(string $slug, int $job)
    {
        $company = $this->company($slug);

        $opening = $this->openPublicJobs($company)->with('department:id,name')->findOrFail($job);

        return $this->ok([
            'company' => ['name' => $company->name, 'logo_url' => $company->logo_url],
            'job' => $this->present($opening, true),
        ]);
    }

    public function apply(Request $request, string $slug, int $job)
    {
        $company = $this->company($slug);
        $opening = $this->openPublicJobs($company)->findOrFail($job);

        $validated = $request->validate([
            'full_name' => 'required|string|max:255',
            'email' => 'required|email:rfc|max:255',
            'phone' => 'nullable|string|max:50',
            'cover_note' => 'nullable|string|max:3000',
            'resume' => ResumeStorageService::VALIDATION_RULES,
            'website' => 'nullable|string|max:255',
        ]);

        // Hidden "website" field: humans leave it empty, form-filling bots do not.
        // Pretend it worked so bots get no signal to adapt to.
        if (filled($validated['website'] ?? null)) {
            return $this->ok(null, 'Application received. Thank you for applying!', 201);
        }

        $email = mb_strtolower(trim($validated['email']));

        $screening = app(ScreeningQuestionService::class);
        $rawAnswers = $request->input('answers', []);
        $checkedAnswers = $screening->validate($screening->forJob($opening->id), is_array($rawAnswers) ? $rawAnswers : []);

        $alreadyApplied = Candidate::query()
            ->withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->where('job_opening_id', $opening->id)
            ->whereRaw('LOWER(email) = ?', [$email])
            ->exists();

        if ($alreadyApplied) {
            return $this->fail('You have already applied for this role.', 422, ['email' => ['You have already applied for this role.']]);
        }

        $outcome = ['knocked_out' => false, 'rejected' => false, 'reasons' => []];

        $candidate = DB::transaction(function () use ($validated, $company, $opening, $request, $screening, $checkedAnswers, &$outcome) {
            $candidate = Candidate::create([
                'company_id' => $company->id,
                'job_opening_id' => $opening->id,
                'full_name' => trim($validated['full_name']),
                'email' => trim($validated['email']),
                'phone' => $validated['phone'] ?? null,
                'source' => 'Careers page',
                'source_type' => 'careers',
                'stage' => 'applied',
                'status' => 'active',
                'applied_at' => now()->toDateString(),
                'notes' => filled($validated['cover_note'] ?? null) ? "Cover note from applicant:\n" . trim($validated['cover_note']) : null,
            ]);

            app(ResumeStorageService::class)->store($candidate, $request->file('resume'));
            app(CandidateWorkflowService::class)->recordStage($candidate, null, 'applied');
            $outcome = $screening->record($candidate, $opening, $checkedAnswers);

            return $candidate;
        });

        app(RecruitmentNotificationService::class)->candidateAdded($candidate->load('jobOpening'), null);

        // Give the applicant a private page to follow the application, and email them the same link.
        $portal = app(CandidatePortalService::class);
        $link = $portal->issueLink($candidate);
        $greeting = 'Hello ' . explode(' ', trim($candidate->full_name))[0] . ',';
        $body = $outcome['rejected']
            ? [
                $greeting,
                'Thank you for applying for ' . $opening->title . ' at ' . $company->name . '. Based on the answers to our screening questions we are not able to take your application further at this time.',
                'You can see the status of your application here: ' . $link['url'],
            ]
            : [
                $greeting,
                'Thank you for applying for ' . $opening->title . ' at ' . $company->name . '. We have your application.',
                'Follow its progress, upload documents and answer any offer here: ' . $link['url'],
                'This link is private to you. Please do not share it.',
            ];

        app(\App\Services\Recruitment\CandidateMailer::class)->send(
            $candidate,
            $outcome['rejected'] ? 'Your application for ' . $opening->title : 'We received your application for ' . $opening->title,
            implode("\n\n", $body)
        );

        return $this->ok(['portal_path' => $link['path']], 'Application received. Thank you for applying!', 201);
    }

    /**
     * Applicants who lost their link can have a new one emailed. The answer never reveals whether
     * an application exists for the address.
     */
    public function portalLink(Request $request, string $slug)
    {
        $company = $this->company($slug);
        $validated = $request->validate(['email' => 'required|email:rfc|max:255']);

        $candidate = Candidate::query()
            ->withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($validated['email']))])
            ->latest('id')
            ->first();

        if ($candidate) {
            app(CandidatePortalService::class)->sendLink(
                $candidate,
                'Your application link',
                'You asked for a new link to your application for {{job}}. Opening it shows where your application stands.'
            );
        }

        return $this->ok(null, 'If we have an application for that email address, a link is on its way.');
    }
}
