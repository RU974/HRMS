<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CandidateWorkflowService
{
    public const STAGES = [
        'applied',
        'screening',
        'interview',
        'offer',
        'hired',
        'rejected',
    ];

    public const STAGE_TRANSITIONS = [
        'applied' => ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'],
        'screening' => ['screening', 'interview', 'offer', 'hired', 'rejected'],
        'interview' => ['interview', 'offer', 'hired', 'rejected'],
        'offer' => ['offer', 'hired', 'rejected'],
        'hired' => ['hired'],
        'rejected' => ['rejected'],
    ];

    public function assertValidStage(string $stage): void
    {
        if (! in_array($stage, self::STAGES, true)) {
            abort(422, 'Invalid recruitment stage.');
        }
    }

    public function assertValidTransition(string $currentStage, string $targetStage): void
    {
        $this->assertValidStage($currentStage);
        $this->assertValidStage($targetStage);

        if (! in_array($targetStage, self::STAGE_TRANSITIONS[$currentStage] ?? [], true)) {
            abort(422, sprintf('Invalid candidate stage transition from "%s" to "%s".', $currentStage, $targetStage));
        }
    }

    public function normalizeChecklist(array $checklist): array
    {
        return collect($checklist)
            ->map(function ($item) {
                return [
                    'title' => trim((string) Arr::get($item, 'title', '')),
                    'completed' => filter_var(Arr::get($item, 'completed', false), FILTER_VALIDATE_BOOLEAN),
                    'notes' => isset($item['notes']) ? trim((string) $item['notes']) : null,
                ];
            })
            ->filter(fn ($item) => filled($item['title']))
            ->values()
            ->all();
    }

    public function normalizeOfferLetterData(array $offerLetterData): array
    {
        return [
            'offer_date' => $offerLetterData['offer_date'] ?? null,
            'start_date' => $offerLetterData['start_date'] ?? null,
            'salary' => $offerLetterData['salary'] ?? null,
            'currency' => $offerLetterData['currency'] ?? null,
            'benefits' => $offerLetterData['benefits'] ?? [],
            'terms' => $offerLetterData['terms'] ?? null,
            'additional_notes' => $offerLetterData['additional_notes'] ?? null,
        ];
    }

    public function prepareOfferLetter(Candidate $candidate, array $data = []): array
    {
        $baseData = $candidate->offer_letter_data ?? [];

        return array_merge([
            'candidate_name' => $candidate->full_name,
            'job_title' => $candidate->jobOpening?->title,
            'offer_date' => $baseData['offer_date'] ?? now()->toDateString(),
            'start_date' => $baseData['start_date'] ?? null,
            'salary' => $baseData['salary'] ?? null,
            'currency' => $baseData['currency'] ?? null,
            'employment_type' => $candidate->jobOpening?->employment_type,
            'benefits' => $baseData['benefits'] ?? [],
            'terms' => $baseData['terms'] ?? null,
            'additional_notes' => $baseData['additional_notes'] ?? null,
        ], $data);
    }

    public function convertToEmployee(Candidate $candidate, ?string $companyId): Employee
    {
        if ($candidate->employee_id) {
            return $candidate->employee ?? Employee::findOrFail($candidate->employee_id);
        }

        $jobOpening = $candidate->jobOpening;
        if (! $jobOpening || ! $jobOpening->department_id) {
            abort(422, 'Cannot convert this candidate to an employee because the linked job opening has no department.');
        }

        return DB::transaction(function () use ($candidate, $jobOpening, $companyId) {
            $existingEmployee = Employee::where('email', $candidate->email)->first();
            if ($existingEmployee) {
                $candidate->update(['employee_id' => $existingEmployee->id]);

                return $existingEmployee;
            }

            $user = User::where('email', $candidate->email)->first();
            if (! $user) {
                $user = User::create([
                    'name' => $candidate->full_name,
                    'email' => $candidate->email,
                    'username' => Str::slug(explode('@', $candidate->email)[0]) . '-' . Str::lower(Str::random(4)),
                    'password' => Hash::make(Str::password(12)),
                    'company_id' => $companyId,
                ]);
            }

            $this->assignEmployeeRole($user);

            $offerData = $candidate->offer_letter_data ?? [];
            $salary = is_numeric($offerData['salary'] ?? null)
                ? (float) $offerData['salary']
                : ((float) preg_replace('/[^0-9.]/', '', (string) ($offerData['salary'] ?? '')) ?: 0);

            $joiningDate = $candidate->onboarding_start_date
                ?? $offerData['start_date']
                ?? now()->toDateString();

            $employee = Employee::create([
                'user_id' => $user->id,
                'name' => $candidate->full_name,
                'email' => $candidate->email,
                'phone' => $candidate->phone,
                'department_id' => $jobOpening->department_id,
                'designation' => $jobOpening->title,
                'employment_type' => $jobOpening->employment_type,
                'joining_date' => $joiningDate,
                'basic_salary' => $salary,
                'allowances' => 0,
                'salary' => $salary,
                'status' => 'active',
            ]);

            $candidate->update(['employee_id' => $employee->id]);

            return $employee;
        });
    }

    private function assignEmployeeRole(User $user): void
    {
        $role = Role::firstOrCreate(
            ['name' => User::ROLE_EMPLOYEE, 'company_id' => null],
            ['guard_name' => 'web', 'description' => 'Default employee role', 'is_system' => true]
        );

        if (! $role) {
            throw ValidationException::withMessages([
                'role' => ['Default employee role could not be assigned.'],
            ]);
        }

        $user->assignRole($role);
    }
}
