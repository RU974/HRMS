<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\JobOpening;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Bulk-create candidates for one job from a CSV file. A dry run reports exactly what an import
 * would do without writing anything, so recruiters can fix the file first.
 */
class CandidateImportService
{
    public const MAX_ROWS = 500;

    public const COLUMNS = ['full_name', 'email', 'phone', 'source', 'tags', 'skills', 'experience_years', 'rating', 'notes'];

    private const ALIASES = [
        'full_name' => ['full_name', 'name', 'candidate', 'candidate_name', 'applicant', 'applicant_name'],
        'email' => ['email', 'email_address', 'e_mail', 'mail'],
        'phone' => ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact', 'contact_number', 'cell'],
        'source' => ['source', 'channel', 'origin'],
        'tags' => ['tags', 'tag', 'labels'],
        'skills' => ['skills', 'skill', 'key_skills'],
        'experience_years' => ['experience_years', 'experience', 'years_of_experience', 'yoe'],
        'rating' => ['rating', 'score'],
        'notes' => ['notes', 'note', 'comments', 'remarks'],
    ];

    public function __construct(
        private readonly CandidateWorkflowService $workflow,
        private readonly RecruitmentNotificationService $notifications,
    ) {
    }

    /**
     * @return array{dry_run: bool, total: int, created: int, skipped: int, warnings: int, rows: array<int, array<string, mixed>>}
     */
    public function run(UploadedFile $file, JobOpening $job, User $actor, bool $dryRun): array
    {
        if ($job->status !== 'open') {
            throw ValidationException::withMessages(['job_opening_id' => ['This job opening is not open for new candidates.']]);
        }

        $rows = $this->read($file);

        if (count($rows) > self::MAX_ROWS) {
            throw ValidationException::withMessages(['file' => ['Import at most ' . self::MAX_ROWS . ' candidates at a time.']]);
        }

        // Only the addresses in this file matter, so look up just those instead of every candidate.
        $emails = collect($rows)->pluck('email')->filter()->map(fn ($email) => mb_strtolower(trim((string) $email)))->unique()->values()->all();
        $known = Candidate::query()->whereIn(DB::raw('LOWER(email)'), $emails)->get(['email', 'job_opening_id']);
        $existing = $known->where('job_opening_id', $job->id)->pluck('email')->map(fn ($email) => mb_strtolower(trim($email)))->flip();
        $elsewhere = $known->where('job_opening_id', '!=', $job->id)->pluck('email')->map(fn ($email) => mb_strtolower(trim($email)))->flip();

        $seen = [];
        $report = [];
        $created = 0;
        $skipped = 0;
        $warnings = 0;

        foreach ($rows as $number => $row) {
            $email = mb_strtolower(trim((string) ($row['email'] ?? '')));
            $line = ['row' => $number, 'full_name' => $row['full_name'] ?? null, 'email' => $row['email'] ?? null, 'status' => 'created', 'message' => null];

            $validator = Validator::make($this->normalise($row), [
                'full_name' => 'required|string|max:255',
                'email' => 'required|email|max:255',
                'phone' => 'nullable|string|max:50',
                'source' => 'nullable|string|max:120',
                'tags' => 'nullable|array|max:20',
                'tags.*' => 'string|max:40',
                'skills' => 'nullable|array|max:40',
                'skills.*' => 'string|max:60',
                'experience_years' => 'nullable|numeric|min:0|max:60',
                'rating' => 'nullable|integer|min:1|max:5',
                'notes' => 'nullable|string|max:5000',
            ]);

            if ($validator->fails()) {
                $line['status'] = 'error';
                $line['message'] = $validator->errors()->first();
            } elseif (isset($seen[$email])) {
                $line['status'] = 'skipped';
                $line['message'] = 'Same email as row ' . $seen[$email] . ' in this file.';
            } elseif ($existing->has($email)) {
                $line['status'] = 'skipped';
                $line['message'] = 'Already applied for this job.';
            }

            if ($line['status'] === 'created') {
                $seen[$email] = $number;

                if ($elsewhere->has($email)) {
                    $line['message'] = 'Also applied for another job.';
                    $warnings++;
                }

                if (! $dryRun) {
                    $this->create($this->normalise($row), $job, $actor);
                }

                $created++;
            } else {
                $skipped++;
            }

            $report[] = $line;
        }

        if (! $dryRun && $created > 0) {
            $this->notifications->notifyUsers(
                $this->notifications->teamIds($job->company_id)->all(),
                'recruitment_candidate',
                "{$created} candidates imported",
                "{$created} candidates were imported for {$job->title}.",
                $job->company_id,
                $actor->id,
                '/recruitment/candidates'
            );
        }

        return ['dry_run' => $dryRun, 'total' => count($rows), 'created' => $created, 'skipped' => $skipped, 'warnings' => $warnings, 'rows' => $report];
    }

    private function create(array $data, JobOpening $job, User $actor): Candidate
    {
        return DB::transaction(function () use ($data, $job, $actor) {
            $candidate = Candidate::create([
                'company_id' => $job->company_id,
                'job_opening_id' => $job->id,
                'full_name' => trim($data['full_name']),
                'email' => trim($data['email']),
                'phone' => $data['phone'] ?? null,
                'source' => $data['source'] ?? 'CSV import',
                'tags' => $data['tags'] ?? null,
                'skills' => $data['skills'] ?? null,
                'experience_years' => $data['experience_years'] ?? null,
                'rating' => $data['rating'] ?? null,
                'notes' => $data['notes'] ?? null,
                'stage' => 'applied',
                'status' => 'active',
                'applied_at' => now()->toDateString(),
            ]);

            $this->workflow->recordStage($candidate, null, 'applied', $actor->id, 'Imported from CSV');
            // Listed skills and years are enough to rank imported people against the job.
            app(FitScoringService::class)->rescore($candidate, $job);

            return $candidate;
        });
    }

    /** Trim every value, turn blanks into null and split the list-like columns. */
    private function normalise(array $row): array
    {
        $row = array_map(fn ($value) => is_string($value) ? trim($value) : $value, $row);
        $row = array_map(fn ($value) => $value === '' ? null : $value, $row);

        foreach (['tags', 'skills'] as $list) {
            if (isset($row[$list]) && is_string($row[$list])) {
                $row[$list] = array_values(array_unique(array_filter(array_map('trim', preg_split('/[;|,]/', $row[$list]) ?: []))));
            }
        }

        return $row;
    }

    /**
     * @return array<int, array<string, ?string>> data rows keyed by spreadsheet row number (header is row 1)
     */
    private function read(UploadedFile $file): array
    {
        $content = (string) file_get_contents($file->getRealPath());
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content) ?? $content;

        if (! mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }

        $firstLine = strtok($content, "\n") ?: '';
        $delimiter = collect([',', ';', "\t"])->sortByDesc(fn ($candidate) => substr_count($firstLine, $candidate))->first();

        $stream = fopen('php://temp', 'r+');
        fwrite($stream, $content);
        rewind($stream);

        $header = fgetcsv($stream, 0, $delimiter);

        if (! $header) {
            throw ValidationException::withMessages(['file' => ['The file is empty.']]);
        }

        $map = [];
        foreach ($header as $index => $title) {
            $key = trim(preg_replace('/[^a-z0-9]+/', '_', mb_strtolower((string) $title)) ?? '', '_');

            foreach (self::ALIASES as $field => $aliases) {
                if (in_array($key, $aliases, true) && ! in_array($field, $map, true)) {
                    $map[$index] = $field;
                    break;
                }
            }
        }

        foreach (['full_name', 'email'] as $required) {
            if (! in_array($required, $map, true)) {
                throw ValidationException::withMessages(['file' => ["The file needs a \"{$required}\" column."]]);
            }
        }

        $rows = [];
        $number = 1;

        while (($line = fgetcsv($stream, 0, $delimiter)) !== false) {
            $number++;

            if ($line === [null] || ! array_filter($line, fn ($cell) => trim((string) $cell) !== '')) {
                continue;
            }

            $row = [];
            foreach ($map as $index => $field) {
                $row[$field] = $line[$index] ?? null;
            }

            $rows[$number] = $row;

            if (count($rows) > self::MAX_ROWS + 1) {
                break;
            }
        }

        fclose($stream);

        return $rows;
    }
}
