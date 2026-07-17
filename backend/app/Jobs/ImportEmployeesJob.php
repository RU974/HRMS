<?php

namespace App\Jobs;

use App\Models\BackgroundRun;
use App\Models\Department;
use App\Models\Employee;
use App\Services\LicenseService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class ImportEmployeesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        private readonly int $backgroundRunId,
        private readonly string $storedFilePath,
        private readonly ?int $companyId,
    ) {
    }

    public function handle(LicenseService $licenseService): void
    {
        $run = BackgroundRun::find($this->backgroundRunId);
        if (!$run) {
            return;
        }

        $run->update(['status' => BackgroundRun::STATUS_PROCESSING]);

        $absolutePath = Storage::path($this->storedFilePath);
        $handle = fopen($absolutePath, 'r');

        try {
            $headers = fgetcsv($handle);
            if (!$headers) {
                $run->update([
                    'status' => BackgroundRun::STATUS_FAILED,
                    'error' => 'CSV file is empty or has no header row.',
                ]);
                return;
            }

            try {
                $licenseService->assertCanAddEmployee($this->companyId);
            } catch (\RuntimeException $e) {
                $run->update([
                    'status' => BackgroundRun::STATUS_FAILED,
                    'error' => $e->getMessage(),
                ]);
                return;
            }

            $imported = 0;
            $skipped = 0;
            $errors = [];
            $defaultDeptId = Department::query()->value('id');

            while (($row = fgetcsv($handle)) !== false) {
                $data = array_combine(array_map('strtolower', array_map('trim', $headers)), array_map('trim', $row));

                $email = $data['email'] ?? null;
                if (!$email || !Validator::make(['email' => $email], ['email' => 'email'])->passes()) {
                    $skipped++;
                    $errors[] = 'Row skipped — invalid or missing email: ' . ($email ?? '(empty)');
                    continue;
                }

                if (Employee::where('email', $email)->exists()) {
                    $skipped++;
                    $errors[] = "Row skipped — email already exists: {$email}";
                    continue;
                }

                $deptName = $data['department'] ?? null;
                $deptId = $defaultDeptId;
                if ($deptName) {
                    $dept = Department::query()->where('name', 'like', $deptName)->value('id');
                    if ($dept) {
                        $deptId = $dept;
                    }
                }

                if (!$deptId) {
                    $skipped++;
                    $errors[] = "Row skipped — no department found for: {$email}";
                    continue;
                }

                try {
                    $licenseService->assertCanAddEmployee($this->companyId);
                } catch (\RuntimeException $e) {
                    $skipped++;
                    $errors[] = "Row skipped — {$e->getMessage()}";
                    continue;
                }

                $name = $data['name'] ?? (trim(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? '')) ?: null);

                Employee::create([
                    'name' => $name ?? $email,
                    'first_name' => $data['first_name'] ?? null,
                    'last_name' => $data['last_name'] ?? null,
                    'email' => $email,
                    'phone' => $data['phone'] ?? null,
                    'company_id' => $this->companyId,
                    'department_id' => $deptId,
                    'designation' => $data['designation'] ?? null,
                    'joining_date' => !empty($data['joining_date']) ? $data['joining_date'] : null,
                    'employment_type' => $data['employment_type'] ?? 'full_time',
                    'basic_salary' => is_numeric($data['basic_salary'] ?? null) ? $data['basic_salary'] : 0,
                    'status' => 'active',
                    'salary' => is_numeric($data['basic_salary'] ?? null) ? $data['basic_salary'] : 0,
                ]);

                $imported++;
            }

            $run->update([
                'status' => BackgroundRun::STATUS_DONE,
                'summary' => compact('imported', 'skipped', 'errors'),
            ]);
        } finally {
            fclose($handle);
            Storage::delete($this->storedFilePath);
        }
    }
}
