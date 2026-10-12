<?php

namespace App\Services\Recruitment;

use App\Models\Bonus;
use App\Models\Candidate;
use App\Models\Company;
use App\Models\Employee;
use App\Models\JobOpening;
use App\Models\RecruitmentAgency;
use App\Models\ReferralBonus;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Where candidates came from (careers page, employee referral, agency) and what a referral earns.
 *
 * A referral bonus is tracked from the moment the candidate is attributed to an employee or an agency,
 * becomes payable once the hire has stayed for the company's waiting period, and is paid out through a
 * payroll bonus on approval.
 */
class ReferralService
{
    public function __construct(
        private readonly CandidateWorkflowService $workflow,
        private readonly RecruitmentNotificationService $notifications,
    ) {
    }

    /** Validate and normalise the attribution fields coming from a staff form. */
    public function normaliseSource(array $data, ?string $companyId): array
    {
        $type = $data['source_type'] ?? null;

        if ($type === null) {
            return [];
        }

        $employeeId = $data['referrer_employee_id'] ?? null;
        $agencyId = $data['agency_id'] ?? null;

        if ($type === 'referral') {
            if (! $employeeId) {
                throw ValidationException::withMessages(['referrer_employee_id' => ['Choose the employee who referred this candidate.']]);
            }
            $agencyId = null;
        } elseif ($type === 'agency') {
            if (! $agencyId) {
                throw ValidationException::withMessages(['agency_id' => ['Choose the agency that supplied this candidate.']]);
            }
            $employeeId = null;
        } else {
            $employeeId = null;
            $agencyId = null;
        }

        if ($employeeId && ! Employee::query()->withoutGlobalScopes()->whereKey($employeeId)->where('company_id', $companyId)->exists()) {
            throw ValidationException::withMessages(['referrer_employee_id' => ['That employee does not belong to your company.']]);
        }

        if ($agencyId && ! RecruitmentAgency::query()->withoutGlobalScopes()->whereKey($agencyId)->where('company_id', $companyId)->where('is_active', true)->exists()) {
            throw ValidationException::withMessages(['agency_id' => ['Choose an active agency from your list.']]);
        }

        return ['source_type' => $type, 'referrer_employee_id' => $employeeId, 'agency_id' => $agencyId];
    }

    /** Human-readable origin used when the free-text source is left empty. */
    public function sourceLabel(Candidate $candidate): ?string
    {
        return match ($candidate->source_type) {
            'referral' => 'Employee referral' . ($candidate->referrer_employee_id ? ': ' . Employee::query()->withoutGlobalScopes()->whereKey($candidate->referrer_employee_id)->value('name') : ''),
            'agency' => 'Agency' . ($candidate->agency_id ? ': ' . RecruitmentAgency::query()->withoutGlobalScopes()->whereKey($candidate->agency_id)->value('name') : ''),
            'careers' => 'Careers page',
            'direct' => 'Direct',
            'import' => 'Imported',
            default => null,
        };
    }

    /** Keep the bonus tracker in step with the candidate's attribution. */
    public function sync(Candidate $candidate): void
    {
        $row = ReferralBonus::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->first();
        $tracked = in_array($candidate->source_type, ['referral', 'agency'], true)
            && (($candidate->source_type === 'referral' && $candidate->referrer_employee_id) || ($candidate->source_type === 'agency' && $candidate->agency_id));

        if (! $tracked) {
            if ($row && $row->status === 'tracking') {
                $row->delete();
            }

            return;
        }

        // Once the hire is made the payout record belongs to whoever was credited at that time.
        if ($row && $row->status !== 'tracking') {
            return;
        }

        $candidate->loadMissing('jobOpening');

        $values = [
            'company_id' => $candidate->company_id,
            'employee_id' => $candidate->source_type === 'referral' ? $candidate->referrer_employee_id : null,
            'agency_id' => $candidate->source_type === 'agency' ? $candidate->agency_id : null,
            'amount' => $candidate->source_type === 'referral' ? $this->defaultAmount($candidate) : null,
            'currency' => $candidate->jobOpening?->salary_currency ?: $this->baseCurrency($candidate->company_id),
            'status' => 'tracking',
        ];

        ReferralBonus::query()->withoutGlobalScopes()->updateOrCreate(['candidate_id' => $candidate->id], $values);
    }

    private function defaultAmount(Candidate $candidate): ?float
    {
        $job = $candidate->jobOpening;
        if ($job && $job->referral_bonus_amount !== null) {
            return (float) $job->referral_bonus_amount;
        }

        $amount = Company::query()->whereKey($candidate->company_id)->value('referral_bonus_amount');

        return $amount === null ? null : (float) $amount;
    }

    private function baseCurrency(?string $companyId): ?string
    {
        return $companyId ? Company::query()->whereKey($companyId)->value('base_currency') : null;
    }

    /** Called when the candidate has been hired. */
    public function onHired(Candidate $candidate, mixed $salary, string $joiningDate): void
    {
        $row = ReferralBonus::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->first();

        if (! $row || $row->status !== 'tracking') {
            return;
        }

        $candidate->loadMissing('jobOpening');
        $waitDays = $row->agency_id ? 0 : (int) Company::query()->whereKey($candidate->company_id)->value('referral_bonus_wait_days');
        $eligibleOn = \Illuminate\Support\Carbon::parse($joiningDate)->addDays($waitDays)->startOfDay();

        $amount = $row->amount;
        if ($row->agency_id) {
            $fee = RecruitmentAgency::query()->withoutGlobalScopes()->whereKey($row->agency_id)->value('fee_percent');
            $amount = ($fee !== null && is_numeric($salary)) ? round((float) $salary * (float) $fee / 100, 2) : null;
        }

        $row->update([
            'amount' => $amount,
            'eligible_on' => $eligibleOn->toDateString(),
            'status' => $eligibleOn->isFuture() ? 'pending' : 'eligible',
        ]);
    }

    /** Move waiting bonuses forward, and drop the ones whose hire left before the waiting period ended. */
    public function refresh(?string $companyId): void
    {
        ReferralBonus::query()
            ->withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->where('status', 'pending')
            ->whereDate('eligible_on', '<=', now()->toDateString())
            ->with('candidate:id,employee_id')
            ->get()
            ->each(function (ReferralBonus $bonus) {
                $employeeStatus = $bonus->candidate?->employee_id
                    ? Employee::query()->withoutGlobalScopes()->whereKey($bonus->candidate->employee_id)->value('status')
                    : null;

                if ($bonus->employee_id && $employeeStatus !== null && $employeeStatus !== 'active') {
                    $bonus->update(['status' => 'cancelled', 'notes' => trim(($bonus->notes ? $bonus->notes . "\n" : '') . 'The referred hire left before the waiting period ended.')]);

                    return;
                }

                $bonus->update(['status' => 'eligible']);
            });
    }

    public function setAmount(ReferralBonus $bonus, ?float $amount, ?string $notes): ReferralBonus
    {
        if (in_array($bonus->status, ['approved', 'paid', 'cancelled'], true)) {
            throw ValidationException::withMessages(['amount' => ['This bonus has already been decided.']]);
        }

        $bonus->update(array_filter(['amount' => $amount, 'notes' => $notes], fn ($value) => $value !== null));

        return $bonus;
    }

    /** Approve a payable bonus; for employees this creates the payroll bonus that will be paid with salary. */
    public function approve(ReferralBonus $bonus, User $actor): ReferralBonus
    {
        $this->refresh($bonus->company_id);
        $bonus->refresh();

        if ($bonus->status !== 'eligible') {
            throw ValidationException::withMessages(['status' => ['Only a bonus that has passed its waiting period can be approved.']]);
        }

        if ($bonus->amount === null || (float) $bonus->amount <= 0) {
            throw ValidationException::withMessages(['amount' => ['Set the amount before approving.']]);
        }

        return DB::transaction(function () use ($bonus, $actor) {
            $payroll = null;

            if ($bonus->employee_id) {
                $name = Candidate::query()->withoutGlobalScopes()->whereKey($bonus->candidate_id)->value('full_name');
                $payroll = Bonus::create([
                    'employee_id' => $bonus->employee_id,
                    'title' => 'Referral bonus: ' . $name,
                    'amount' => $bonus->amount,
                    'taxable' => true,
                    'effective_date' => now()->toDateString(),
                    'notes' => 'Created from an approved employee referral.',
                ]);
            }

            $bonus->update(['status' => 'approved', 'bonus_id' => $payroll?->id, 'decided_by' => $actor->id]);

            return $bonus;
        });
    }

    public function markPaid(ReferralBonus $bonus, User $actor): ReferralBonus
    {
        if ($bonus->status !== 'approved') {
            throw ValidationException::withMessages(['status' => ['Approve the bonus before marking it paid.']]);
        }

        $bonus->update(['status' => 'paid', 'paid_on' => now()->toDateString(), 'decided_by' => $actor->id]);

        return $bonus;
    }

    public function cancel(ReferralBonus $bonus, User $actor, ?string $notes): ReferralBonus
    {
        if (in_array($bonus->status, ['paid', 'cancelled'], true)) {
            throw ValidationException::withMessages(['status' => ['This bonus is already closed.']]);
        }

        // An approved employee bonus already exists in payroll; it has to be removed there first.
        if ($bonus->status === 'approved' && $bonus->bonus_id && Bonus::query()->whereKey($bonus->bonus_id)->whereNotNull('payroll_id')->exists()) {
            throw ValidationException::withMessages(['status' => ['The payroll bonus is already part of a payroll run.']]);
        }

        DB::transaction(function () use ($bonus, $actor, $notes) {
            if ($bonus->bonus_id) {
                Bonus::query()->whereKey($bonus->bonus_id)->delete();
            }

            $bonus->update([
                'status' => 'cancelled',
                'bonus_id' => null,
                'decided_by' => $actor->id,
                'notes' => filled($notes) ? trim($notes) : $bonus->notes,
            ]);
        });

        return $bonus;
    }

    /** The employee record of a signed-in user, if any. */
    public function employeeFor(User $user): ?Employee
    {
        return Employee::query()->withoutGlobalScopes()->where('user_id', $user->id)->where('company_id', $user->company_id)->first();
    }

    /**
     * An employee puts someone forward for an open job.
     */
    public function submit(User $user, Employee $employee, JobOpening $job, array $data, ?UploadedFile $resume): Candidate
    {
        if ($job->status !== 'open') {
            throw ValidationException::withMessages(['job_opening_id' => ['This job is not open for referrals.']]);
        }

        $email = mb_strtolower(trim($data['email']));

        if (Candidate::query()->withoutGlobalScopes()->where('company_id', $job->company_id)->where('job_opening_id', $job->id)->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            throw ValidationException::withMessages(['email' => ['This person has already applied or been referred for this job.']]);
        }

        if ((string) $employee->email !== '' && mb_strtolower((string) $employee->email) === $email) {
            throw ValidationException::withMessages(['email' => ['You cannot refer yourself.']]);
        }

        $candidate = DB::transaction(function () use ($user, $employee, $job, $data, $resume) {
            $candidate = Candidate::create([
                'company_id' => $job->company_id,
                'job_opening_id' => $job->id,
                'full_name' => trim($data['full_name']),
                'email' => trim($data['email']),
                'phone' => $data['phone'] ?? null,
                'source' => 'Employee referral: ' . $employee->name,
                'source_type' => 'referral',
                'referrer_employee_id' => $employee->id,
                'stage' => 'applied',
                'status' => 'active',
                'applied_at' => now()->toDateString(),
                'notes' => filled($data['note'] ?? null) ? "Referral note from {$employee->name}:\n" . trim($data['note']) : null,
            ]);

            if ($resume) {
                app(ResumeStorageService::class)->store($candidate, $resume);
            }

            $this->workflow->recordStage($candidate, null, 'applied', $user->id, 'Referred by ' . $employee->name);
            $this->sync($candidate);

            return $candidate;
        });

        $this->notifications->candidateAdded($candidate->load('jobOpening'), $user->id);

        return $candidate;
    }

    /** What a referrer may see about their referral: nothing beyond a plain-language status. */
    public function statusLabel(Candidate $candidate): string
    {
        return match ($candidate->stage) {
            'applied' => 'Received',
            'screening' => 'Being reviewed',
            'interview' => 'Interviewing',
            'offer' => 'Offer stage',
            'hired' => 'Hired',
            'rejected' => 'Not progressing',
            default => 'In review',
        };
    }
}
