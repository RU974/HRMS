<?php

namespace App\Jobs;

use App\Models\BackgroundRun;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
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
        private readonly ?string $companyId,
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
            if ($headers) {
                // Strip a UTF-8 BOM (Excel "CSV UTF-8") so the first column is still "name".
                $headers[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $headers[0]);
                $headers = array_map(fn ($h) => strtolower(trim((string) $h)), $headers);
            }
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
            $defaultDeptId = Department::query()->where('company_id', $this->companyId)->value('id');
            $line = 1;

            while (($row = fgetcsv($handle)) !== false) {
                $line++;
                if ($row === [null] || count(array_filter($row, fn ($v) => trim((string) $v) !== '')) === 0) {
                    continue; // blank line
                }

                // Pad/trim so rows with missing or extra cells never break array_combine.
                $row = array_slice(array_pad($row, count($headers), ''), 0, count($headers));
                $data = array_combine($headers, array_map(fn ($v) => trim((string) $v), $row));

                $email = $data['email'] ?? null;
                if (!$email || !Validator::make(['email' => $email], ['email' => 'email'])->passes()) {
                    $skipped++;
                    $errors[] = 'Row skipped — invalid or missing email: ' . ($email ?? '(empty)');
                    continue;
                }

                if (Employee::where('email', $email)->where('company_id', $this->companyId)->exists()) {
                    $skipped++;
                    $errors[] = "Row skipped — email already exists: {$email}";
                    continue;
                }

                $deptName = $data['department'] ?? null;
                $deptId = $defaultDeptId;
                if ($deptName) {
                    $dept = Department::query()
                        ->where('company_id', $this->companyId)
                        ->where('name', 'like', $deptName)
                        ->value('id');
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

                $nullable = fn (string $key) => ($data[$key] ?? '') !== '' ? $data[$key] : null;
                $date = function (string $key) use ($data) {
                    if (($data[$key] ?? '') === '') {
                        return null;
                    }
                    try {
                        return \Illuminate\Support\Carbon::parse($data[$key])->toDateString();
                    } catch (\Throwable) {
                        return null;
                    }
                };
                $salary = is_numeric($data['basic_salary'] ?? null) ? $data['basic_salary'] : 0;
                $gender = strtolower((string) ($data['gender'] ?? ''));

                try {
                    \Illuminate\Support\Facades\DB::transaction(function () use ($email, $name, $nullable, $date, $salary, $gender, $deptId, $data) {
                    $user = User::where('email', $email)->first();
                    if ($user && (string) ($user->company_id ?? '') !== (string) $this->companyId) {
                        throw new \RuntimeException('a user account with this email exists in another company');
                    }
                    if ($user && Employee::where('user_id', $user->id)->exists()) {
                        throw new \RuntimeException('this user is already linked to another employee');
                    }
                    if (!$user) {
                        $base = Str::slug(explode('@', $email)[0], '.') ?: 'user';
                        $username = $base;
                        for ($i = 1; User::where('username', $username)->exists(); $i++) {
                            $username = $base . $i;
                        }
                        $user = User::create([
                            'name' => ($name ?? '') !== '' ? $name : $email,
                            'email' => $email,
                            'username' => $username,
                            'password' => Hash::make(Str::password(12)),
                            'must_change_password' => true,
                            'company_id' => $this->companyId,
                        ]);
                    }
                    $role = Role::firstOrCreate(
                        ['name' => User::ROLE_EMPLOYEE, 'company_id' => null],
                        ['guard_name' => 'web', 'description' => 'Default employee role', 'is_system' => true]
                    );
                    $user->assignRole($role);

                    Employee::create([
                        'user_id' => $user->id,
                        'name' => ($name ?? '') !== '' ? $name : $email,
                        'first_name' => $nullable('first_name'),
                        'last_name' => $nullable('last_name'),
                        'email' => $email,
                        'phone' => $nullable('phone'),
                        'cnic' => $nullable('cnic'),
                        'gender' => in_array($gender, ['male', 'female', 'other'], true) ? $gender : null,
                        'date_of_birth' => $date('date_of_birth'),
                        'address' => $nullable('address'),
                        'allowances' => is_numeric($data['allowances'] ?? null) ? $data['allowances'] : 0,
                        'company_id' => $this->companyId,
                        'department_id' => $deptId,
                        'designation' => $nullable('designation'),
                        'joining_date' => $date('joining_date'),
                        'employment_type' => $nullable('employment_type') ?? 'full_time',
                        'basic_salary' => $salary,
                        'status' => 'active',
                        'salary' => $salary,
                    ]);
                    });
                    $imported++;
                } catch (\Throwable $e) {
                    $skipped++;
                    $errors[] = "Line {$line} skipped ({$email}) — " . $e->getMessage();
                }
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
