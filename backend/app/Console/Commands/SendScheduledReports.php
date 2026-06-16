<?php

namespace App\Console\Commands;

use App\Models\Report;
use App\Services\ReportAnalyticsService;
use App\Services\ReportExportService;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

class SendScheduledReports extends Command
{
    protected $signature = 'reports:send-scheduled';
    protected $description = 'Email saved reports whose schedule (daily/weekly) is due to run.';

    public function handle(): int
    {
        $service = new ReportAnalyticsService();
        $exporter = new ReportExportService();
        $sent = 0;

        $dueReports = Report::query()
            ->where('status', 'active')
            ->whereNotNull('filters')
            ->with('creator')
            ->get()
            ->filter(function (Report $report) {
                $schedule = $report->filters['schedule'] ?? null;

                return is_array($schedule)
                    && !empty($schedule['enabled'])
                    && !empty($schedule['next_run_at'])
                    && strtotime($schedule['next_run_at']) <= time();
            });

        foreach ($dueReports as $report) {
            try {
                $this->sendReport($report, $service, $exporter);
                $sent++;
            } catch (\Throwable $e) {
                $this->warn("Failed to send scheduled report #{$report->id}: {$e->getMessage()}");
            }
        }

        $this->info("Sent {$sent} scheduled report(s).");

        return self::SUCCESS;
    }

    private function sendReport(Report $report, ReportAnalyticsService $service, ReportExportService $exporter): void
    {
        $schedule = $report->filters['schedule'];
        $creator = $report->creator;
        $now = Carbon::now();

        $request = Request::create('/');
        $request->setUserResolver(fn () => $creator);

        [$columns, $rows, $periodLabel] = $this->buildReportData($report, $service, $request, $now);

        $format = strtolower($schedule['format'] ?? 'csv');
        $export = $exporter->buildExport($report->name . '-' . $now->format('Y-m-d'), $columns, $rows, $format);

        $recipients = array_values(array_filter((array) ($schedule['recipients'] ?? [])));
        if (empty($recipients) && $creator?->email) {
            $recipients = [$creator->email];
        }

        if (empty($recipients)) {
            return;
        }

        Mail::raw(
            "Attached is your scheduled \"{$report->name}\" report for {$periodLabel}.",
            function ($message) use ($recipients, $report, $periodLabel, $export) {
                $message->to($recipients)
                    ->subject("Scheduled Report: {$report->name} ({$periodLabel})")
                    ->attachData($export['content'], $export['filename'], ['mime' => $export['mime']]);
            }
        );

        $timezone = $schedule['timezone'] ?? config('app.timezone');
        $schedule['last_sent_at'] = $now->toIso8601String();
        $schedule['next_run_at'] = ReportAnalyticsService::computeNextRun($schedule['interval'] ?? 'daily', $timezone)->toIso8601String();

        $filters = $report->filters;
        $filters['schedule'] = $schedule;

        $report->update([
            'filters' => $filters,
            'last_run_at' => $now,
        ]);
    }

    /**
     * @return array{0: array<int, string>, 1: array<int, array<string, mixed>>, 2: string}
     */
    private function buildReportData(Report $report, ReportAnalyticsService $service, Request $request, Carbon $now): array
    {
        $month = $now->month;
        $year = $now->year;
        $periodLabel = $now->format('F Y');

        switch ($report->type) {
            case 'employee':
                $data = $service->employeeSummary($request);
                return [
                    ['Status', 'Count'],
                    $data->map(fn ($row) => ['status' => $row->status, 'count' => $row->count])->toArray(),
                    $periodLabel,
                ];

            case 'attendance':
                $data = $service->attendanceSummary($request, $month, $year);
                return [
                    ['Status', 'Count'],
                    $data->map(fn ($row) => ['status' => $row->status, 'count' => $row->count])->toArray(),
                    $periodLabel,
                ];

            case 'leave':
                $data = $service->leaveSummary($request, $month, $year);
                return [
                    ['Status', 'Count'],
                    $data->map(fn ($row) => ['status' => $row->status, 'count' => $row->count])->toArray(),
                    $periodLabel,
                ];

            case 'payroll':
                $data = $service->payrollSummary($request, $month, $year);
                return [
                    ['Status', 'Total Records', 'Total Net Salary', 'Total Base Salary', 'Total Bonus', 'Total Deductions', 'Total Tax'],
                    $data->map(fn ($row) => [
                        'status' => $row->status,
                        'total_records' => $row->total_records,
                        'total_net_salary' => $row->total_net_salary,
                        'total_base_salary' => $row->total_base_salary,
                        'total_bonus' => $row->total_bonus,
                        'total_deductions' => $row->total_deductions,
                        'total_tax' => $row->total_tax,
                    ])->toArray(),
                    $periodLabel,
                ];

            default:
                $data = $service->analyticsOverview($request, $month, $year);
                return [
                    ['Metric', 'Value'],
                    collect($data)->map(fn ($value, $key) => ['metric' => $key, 'value' => $value])->values()->toArray(),
                    $periodLabel,
                ];
        }
    }
}
