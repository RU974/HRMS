<?php

namespace App\Jobs;

use App\Models\BackgroundRun;
use App\Models\Employee;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ExportEmployeesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * @param int[] $employeeIds
     */
    public function __construct(
        private readonly int $backgroundRunId,
        private readonly array $employeeIds,
    ) {
    }

    public function handle(): void
    {
        $run = BackgroundRun::find($this->backgroundRunId);
        if (!$run) {
            return;
        }

        $run->update(['status' => BackgroundRun::STATUS_PROCESSING]);

        try {
            $rows = Employee::query()
                ->with(['department', 'designationRef'])
                ->whereIn('id', $this->employeeIds)
                ->orderByDesc('created_at')
                ->get();

            $relativePath = 'exports/employees-' . Str::uuid() . '.csv';
            $absolutePath = Storage::path($relativePath);
            Storage::makeDirectory('exports');

            $out = fopen($absolutePath, 'w');
            fputcsv($out, ['ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Status', 'Salary', 'Created At']);
            foreach ($rows as $row) {
                fputcsv($out, [
                    $row->id,
                    $row->name,
                    $row->email,
                    $row->phone,
                    $row->department?->name,
                    $row->designationRef?->name ?? $row->designation,
                    $row->status,
                    $row->salary,
                    $row->created_at,
                ]);
            }
            fclose($out);

            $run->update([
                'status' => BackgroundRun::STATUS_DONE,
                'summary' => ['file_path' => $relativePath, 'row_count' => $rows->count()],
            ]);
        } catch (\Throwable $e) {
            $run->update([
                'status' => BackgroundRun::STATUS_FAILED,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
