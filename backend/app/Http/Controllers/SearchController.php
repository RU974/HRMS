<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Models\Attendance;
use App\Models\Candidate;
use App\Models\Department;
use App\Models\Designation;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\Leave;
use App\Models\Payroll;
use App\Models\PerformanceAppraisal;
use App\Models\PerformanceGoal;
use App\Models\PerformanceKpi;
use App\Models\PerformanceReview;
use App\Models\Report;
use App\Models\Shift;
use App\Services\Search\AnnouncementSearchService;
use App\Services\Search\ChatSearchService;
use App\Services\Search\NotificationSearchService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SearchController extends Controller
{
    public function __construct(
        private readonly AnnouncementSearchService $announcementSearchService,
        private readonly NotificationSearchService $notificationSearchService,
        private readonly ChatSearchService $chatSearchService,
    ) {
    }

    public function index(Request $request)
    {
        $validated = $request->validate([
            'q' => 'required|string|max:100',
        ]);

        $query = $this->sanitizeQuery($validated['q']);
        if ($query === '') {
            return $this->ok([
                'query' => '',
                'total' => 0,
                'categories' => [],
            ]);
        }

        $employee = Employee::where('user_id', $request->user()?->id)->first();
        $categories = [];

        $this->appendCategory($categories, 'employees', 'Employees', $this->searchEmployees($request, $query, $employee?->id));
        $this->appendCategory($categories, 'departments', 'Departments', $this->searchDepartments($query), $request->user()?->can('manage settings'));
        $this->appendCategory($categories, 'designations', 'Designations', $this->searchDesignations($query), $request->user()?->can('manage settings'));
        $this->appendCategory($categories, 'shifts', 'Shifts', $this->searchShifts($query), $request->user()?->can('attendance.edit') || $request->user()?->can('manage settings'));
        $this->appendCategory($categories, 'holidays', 'Holidays', $this->searchHolidays($query), $request->user()?->can('attendance.edit') || $request->user()?->can('manage settings'));
        $this->appendCategory($categories, 'attendance', 'Attendance', $this->searchAttendance($request, $query, $employee?->id));
        $this->appendCategory($categories, 'leaves', 'Leaves', $this->searchLeaves($request, $query, $employee?->id));
        $this->appendCategory($categories, 'payroll', 'Payroll', $this->searchPayroll($request, $query, $employee?->id));
        $this->appendCategory($categories, 'reports', 'Reports', $this->searchReports($query), $request->user()?->can('view reports') || $request->user()?->can('export reports') || $request->user()?->can('manage payroll') || $request->user()?->can('manage performance') || $request->user()?->can('view performance') || $request->user()?->can('recruitment.view'));
        $this->appendCategory($categories, 'announcements', 'Announcements', $this->searchAnnouncements($request, $query));
        $this->appendCategory($categories, 'notifications', 'Notifications', $this->searchNotifications($request, $query));
        $this->appendCategory($categories, 'chat', 'Chat Messages', $this->searchChatMessages($request, $query));
        $this->appendCategory($categories, 'recruitment_jobs', 'Job Openings', $this->searchJobOpenings($request, $query));
        $this->appendCategory($categories, 'recruitment_candidates', 'Candidates', $this->searchCandidates($request, $query));
        $this->appendCategory($categories, 'recruitment_interviews', 'Interviews', $this->searchInterviews($request, $query));
        $this->appendCategory($categories, 'recruitment_onboarding', 'Onboarding', $this->searchOnboarding($request, $query));
        $this->appendCategory($categories, 'performance_reviews', 'Performance Reviews', $this->searchPerformanceReviews($request, $query));
        $this->appendCategory($categories, 'performance_kpis', 'Performance KPIs', $this->searchPerformanceKpis($request, $query));
        $this->appendCategory($categories, 'performance_goals', 'Performance Goals', $this->searchPerformanceGoals($request, $query));
        $this->appendCategory($categories, 'performance_appraisals', 'Performance Appraisals', $this->searchPerformanceAppraisals($request, $query));

        $total = array_reduce(
            $categories,
            fn (int $carry, array $category): int => $carry + count($category['items']),
            0
        );

        return $this->ok([
            'query' => $query,
            'total' => $total,
            'categories' => array_values($categories),
        ]);
    }

    private function appendCategory(array &$categories, string $key, string $label, array $items, bool $allowed = true): void
    {
        if (!$allowed || empty($items)) {
            return;
        }

        $categories[] = [
            'key' => $key,
            'label' => $label,
            'items' => $items,
        ];
    }

    private function searchEmployees(Request $request, string $query, ?int $employeeId): array
    {
        $user = $request->user();
        $canViewAll = (bool) $user?->can('view employees');
        $companyId = $user?->company_id;
        if (!$canViewAll && $employeeId === null) {
            return [];
        }

        $like = '%' . $query . '%';
        $builder = Employee::query()
            ->with(['department:id,name', 'designationRef:id,name'])
            ->when($companyId, function ($query) use ($companyId): void {
                $query->whereHas('user', function ($userQuery) use ($companyId): void {
                    $userQuery->where('company_id', $companyId);
                });
            });

        return $builder
            ->where(function ($builder) use ($like, $employeeId, $canViewAll): void {
                if ($canViewAll) {
                    $builder->where(function ($search) use ($like): void {
                        $search->where('name', 'like', $like)
                            ->orWhere('email', 'like', $like)
                            ->orWhere('employee_number', 'like', $like)
                            ->orWhere('designation', 'like', $like)
                            ->orWhereHas('department', function ($departmentQuery) use ($like): void {
                                $departmentQuery->where('name', 'like', $like);
                            })
                            ->orWhereHas('designationRef', function ($designationQuery) use ($like): void {
                                $designationQuery->where('name', 'like', $like);
                            });
                    });
                    return;
                }

                $builder->whereKey($employeeId);
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(function (Employee $employee): array {
                $department = $employee->department?->name ?? 'Unassigned department';
                $designation = $employee->designationRef?->name ?? $employee->designation ?? 'Unassigned designation';

                return [
                    'id' => $employee->id,
                    'title' => $employee->name,
                    'subtitle' => $employee->email,
                    'detail' => trim($employee->employee_number ? "Employee #{$employee->employee_number} • " : '') . "{$department} • {$designation}",
                    'path' => '/employees',
                ];
            })
            ->all();
    }

    private function searchDepartments(string $query): array
    {
        $like = '%' . $query . '%';
        return Department::query()
            ->where('name', 'like', $like)
            ->orderBy('name')
            ->limit(5)
            ->get()
            ->map(fn (Department $department): array => [
                'id' => $department->id,
                'title' => $department->name,
                'subtitle' => 'Department',
                'detail' => 'Open the departments module to manage this record.',
                'path' => '/departments',
            ])
            ->all();
    }

    private function searchDesignations(string $query): array
    {
        $like = '%' . $query . '%';
        return Designation::query()
            ->where('name', 'like', $like)
            ->orderBy('name')
            ->limit(5)
            ->get()
            ->map(fn (Designation $designation): array => [
                'id' => $designation->id,
                'title' => $designation->name,
                'subtitle' => 'Designation',
                'detail' => 'Open the designations module to manage this record.',
                'path' => '/designations',
            ])
            ->all();
    }

    private function searchShifts(string $query): array
    {
        $like = '%' . $query . '%';
        return Shift::query()
            ->where('name', 'like', $like)
            ->orderBy('name')
            ->limit(5)
            ->get()
            ->map(fn (Shift $shift): array => [
                'id' => $shift->id,
                'title' => $shift->name,
                'subtitle' => 'Shift',
                'detail' => 'Open the shifts module to manage this record.',
                'path' => '/shifts',
            ])
            ->all();
    }

    private function searchHolidays(string $query): array
    {
        $like = '%' . $query . '%';
        return Holiday::query()
            ->where('name', 'like', $like)
            ->orWhere('holiday_date', 'like', $like)
            ->orderBy('holiday_date', 'desc')
            ->limit(5)
            ->get()
            ->map(fn (Holiday $holiday): array => [
                'id' => $holiday->id,
                'title' => $holiday->name,
                'subtitle' => $holiday->holiday_date?->format('M j, Y') ?? (string) $holiday->holiday_date,
                'detail' => $holiday->is_optional ? 'Optional holiday' : 'Company holiday',
                'path' => '/holidays',
            ])
            ->all();
    }

    private function searchAttendance(Request $request, string $query, ?int $employeeId): array
    {
        $user = $request->user();
        $canViewAll = (bool) ($user?->can('manage attendance') || $user?->can('view attendance'));
        $companyId = $user?->company_id;
        if (!$canViewAll && $employeeId === null) {
            return [];
        }

        $like = '%' . $query . '%';
        $builder = Attendance::query()->with('employee:id,name,employee_number');
        if ($companyId) {
            $builder->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }

        if ($canViewAll) {
            $builder->where(function ($search) use ($like): void {
                $search->where('status', 'like', $like)
                    ->orWhere('notes', 'like', $like)
                    ->orWhere('date', 'like', $like)
                    ->orWhereHas('employee', function ($employeeQuery) use ($like): void {
                        $employeeQuery->where('name', 'like', $like)
                            ->orWhere('employee_number', 'like', $like);
                    });
            });
        } else {
            $builder->where('employee_id', $employeeId);
        }

        return $builder->latest()
            ->limit(5)
            ->get()
            ->map(function (Attendance $attendance): array {
                $employeeName = $attendance->employee?->name ?? 'Unknown employee';

                return [
                    'id' => $attendance->id,
                    'title' => $employeeName,
                    'subtitle' => (string) $attendance->date,
                    'detail' => ucfirst($attendance->status),
                    'path' => '/attendance',
                ];
            })
            ->all();
    }

    private function searchLeaves(Request $request, string $query, ?int $employeeId): array
    {
        $user = $request->user();
        $canViewAll = (bool) ($user?->can('view leaves') || $user?->can('approve leaves'));
        $canViewOwn = (bool) $user?->can('request own leave');
        $companyId = $user?->company_id;
        if (!$canViewAll && (!$canViewOwn || $employeeId === null)) {
            return [];
        }

        $like = '%' . $query . '%';
        $builder = Leave::query()->with('employee:id,name,employee_number');
        if ($companyId) {
            $builder->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }

        if ($canViewAll) {
            $builder->where(function ($search) use ($like): void {
                $search->where('type', 'like', $like)
                    ->orWhere('status', 'like', $like)
                    ->orWhere('from_date', 'like', $like)
                    ->orWhere('to_date', 'like', $like)
                    ->orWhereHas('employee', function ($employeeQuery) use ($like): void {
                        $employeeQuery->where('name', 'like', $like)
                            ->orWhere('employee_number', 'like', $like);
                    });
            });
        } elseif ($employeeId !== null) {
            $builder->where('employee_id', $employeeId);
        }

        return $builder->latest()
            ->limit(5)
            ->get()
            ->map(function (Leave $leave): array {
                return [
                    'id' => $leave->id,
                    'title' => $leave->employee?->name ?? 'Leave request',
                    'subtitle' => "{$leave->type} • {$leave->from_date} to {$leave->to_date}",
                    'detail' => ucfirst($leave->status),
                    'path' => '/leaves',
                ];
            })
            ->all();
    }

    private function searchPayroll(Request $request, string $query, ?int $employeeId): array
    {
        $user = $request->user();
        $canViewAll = (bool) ($user?->can('manage payroll') || $user?->can('view payroll'));
        $canViewOwn = (bool) $user?->can('view own payroll');
        $companyId = $user?->company_id;
        if (!$canViewAll && (!$canViewOwn || $employeeId === null)) {
            return [];
        }

        $like = '%' . $query . '%';
        $builder = Payroll::query()->with('employee:id,name,employee_number');
        if ($companyId) {
            $builder->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }

        if ($canViewAll) {
            $builder->where(function ($search) use ($like): void {
                $search->where('status', 'like', $like)
                    ->orWhere('month', 'like', $like)
                    ->orWhere('year', 'like', $like)
                    ->orWhere('net_salary', 'like', $like)
                    ->orWhereHas('employee', function ($employeeQuery) use ($like): void {
                        $employeeQuery->where('name', 'like', $like)
                            ->orWhere('employee_number', 'like', $like);
                    });
            });
        } elseif ($employeeId !== null) {
            $builder->where('employee_id', $employeeId);
        }

        return $builder->latest()
            ->limit(5)
            ->get()
            ->map(function (Payroll $payroll): array {
                return [
                    'id' => $payroll->id,
                    'title' => $payroll->employee?->name ?? 'Payroll record',
                    'subtitle' => "{$payroll->month}/{$payroll->year} • {$payroll->status}",
                    'detail' => 'Net salary: ' . $payroll->net_salary,
                    'path' => '/payroll',
                ];
            })
            ->all();
    }

    private function searchReports(string $query): array
    {
        $like = '%' . $query . '%';
        return Report::query()
            ->with(['creator:id,name,email'])
            ->when(request()?->user()?->company_id, function ($builder) {
                $companyId = request()?->user()?->company_id;
                $builder->whereHas('creator', function ($creatorQuery) use ($companyId): void {
                    $creatorQuery->where('company_id', $companyId);
                });
            })
            ->where(function ($builder) use ($like): void {
                $builder->where('name', 'like', $like)
                    ->orWhere('description', 'like', $like)
                    ->orWhere('type', 'like', $like)
                    ->orWhere('status', 'like', $like);
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (Report $report): array => [
                'id' => $report->id,
                'title' => $report->name,
                'subtitle' => ucfirst((string) $report->type) . ' report',
                'detail' => $report->description ?? 'Report record',
                'path' => '/reports',
            ])
            ->all();
    }

    private function searchAnnouncements(Request $request, string $query): array
    {
        return $this->announcementSearchService->search($request->user(), $query);
    }

    private function searchNotifications(Request $request, string $query): array
    {
        return $this->notificationSearchService->search($request->user(), $query);
    }

    private function searchChatMessages(Request $request, string $query): array
    {
        return $this->chatSearchService->search($request->user(), $query);
    }

    private function searchJobOpenings(Request $request, string $query): array
    {
        if (!$request->user()?->can('recruitment.view')) {
            return [];
        }

        $like = '%' . $query . '%';
        return JobOpening::query()
            ->with('department:id,name')
            ->where(function ($builder) use ($like): void {
                $builder->where('title', 'like', $like)
                    ->orWhere('location', 'like', $like)
                    ->orWhere('employment_type', 'like', $like)
                    ->orWhere('description', 'like', $like)
                    ->orWhereHas('department', function ($departmentQuery) use ($like): void {
                        $departmentQuery->where('name', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (JobOpening $jobOpening): array => [
                'id' => $jobOpening->id,
                'title' => $jobOpening->title,
                'subtitle' => ($jobOpening->department?->name ?? 'No department') . ' • ' . ucfirst((string) $jobOpening->status),
                'detail' => $jobOpening->location ?? 'Job opening',
                'path' => '/recruitment/jobs',
            ])
            ->all();
    }

    private function searchCandidates(Request $request, string $query): array
    {
        if (!$request->user()?->can('recruitment.view')) {
            return [];
        }

        $like = '%' . $query . '%';
        return Candidate::query()
            ->with('jobOpening:id,title')
            ->where(function ($builder) use ($like): void {
                $builder->where('full_name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('source', 'like', $like)
                    ->orWhere('stage', 'like', $like)
                    ->orWhereHas('jobOpening', function ($jobQuery) use ($like): void {
                        $jobQuery->where('title', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (Candidate $candidate): array => [
                'id' => $candidate->id,
                'title' => $candidate->full_name,
                'subtitle' => $candidate->email,
                'detail' => ($candidate->jobOpening?->title ?? 'Candidate') . ' • ' . ucfirst((string) $candidate->stage),
                'path' => '/recruitment/candidates',
            ])
            ->all();
    }

    private function searchInterviews(Request $request, string $query): array
    {
        if (!$request->user()?->can('recruitment.view')) {
            return [];
        }

        $like = '%' . $query . '%';
        return Interview::query()
            ->with(['candidate:id,full_name'])
            ->where(function ($builder) use ($like): void {
                $builder->where('interviewer_name', 'like', $like)
                    ->orWhere('interview_type', 'like', $like)
                    ->orWhere('result', 'like', $like)
                    ->orWhere('feedback', 'like', $like)
                    ->orWhereHas('candidate', function ($candidateQuery) use ($like): void {
                        $candidateQuery->where('full_name', 'like', $like);
                    });
            })
            ->latest('scheduled_at')
            ->limit(5)
            ->get()
            ->map(fn (Interview $interview): array => [
                'id' => $interview->id,
                'title' => $interview->candidate?->full_name ?? $interview->interviewer_name,
                'subtitle' => ucfirst((string) $interview->interview_type) . ' interview',
                'detail' => 'Interviewer: ' . $interview->interviewer_name . ' • Result: ' . ucfirst((string) $interview->result),
                'path' => '/recruitment/interviews',
            ])
            ->all();
    }

    private function searchOnboarding(Request $request, string $query): array
    {
        if (!$request->user()?->can('recruitment.view')) {
            return [];
        }

        $like = '%' . $query . '%';
        return Candidate::query()
            ->with('jobOpening:id,title')
            ->where('stage', 'hired')
            ->where(function ($builder) use ($like): void {
                $builder->where('full_name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('onboarding_status', 'like', $like)
                    ->orWhere('onboarding_notes', 'like', $like)
                    ->orWhereHas('jobOpening', function ($jobQuery) use ($like): void {
                        $jobQuery->where('title', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (Candidate $candidate): array => [
                'id' => $candidate->id,
                'title' => $candidate->full_name,
                'subtitle' => $candidate->jobOpening?->title ?? 'Onboarding record',
                'detail' => ucfirst((string) $candidate->onboarding_status) . ' onboarding',
                'path' => '/recruitment/onboarding',
            ])
            ->all();
    }

    private function searchPerformanceReviews(Request $request, string $query): array
    {
        if (!$request->user()?->can('view performance') && !$request->user()?->can('manage performance')) {
            return [];
        }

        $like = '%' . $query . '%';
        return PerformanceReview::query()
            ->with('employee:id,name,employee_number')
            ->when($request->user()?->company_id, function ($builder) use ($request): void {
                $builder->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->where(function ($builder) use ($like): void {
                $builder->where('period', 'like', $like)
                    ->orWhere('summary', 'like', $like)
                    ->orWhere('rating', 'like', $like)
                    ->orWhereHas('employee', function ($employeeQuery) use ($like): void {
                        $employeeQuery->where('name', 'like', $like)
                            ->orWhere('employee_number', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (PerformanceReview $review): array => [
                'id' => $review->id,
                'title' => $review->employee?->name ?? 'Performance review',
                'subtitle' => $review->period,
                'detail' => 'Rating: ' . $review->rating,
                'path' => '/performance/reviews',
            ])
            ->all();
    }

    private function searchPerformanceKpis(Request $request, string $query): array
    {
        if (!$request->user()?->can('view performance') && !$request->user()?->can('manage performance')) {
            return [];
        }

        $like = '%' . $query . '%';
        return PerformanceKpi::query()
            ->with('employee:id,name,employee_number')
            ->when($request->user()?->company_id, function ($builder) use ($request): void {
                $builder->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->where(function ($builder) use ($like): void {
                $builder->where('name', 'like', $like)
                    ->orWhere('unit', 'like', $like)
                    ->orWhereHas('employee', function ($employeeQuery) use ($like): void {
                        $employeeQuery->where('name', 'like', $like)
                            ->orWhere('employee_number', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (PerformanceKpi $kpi): array => [
                'id' => $kpi->id,
                'title' => $kpi->name,
                'subtitle' => $kpi->employee?->name ?? 'Performance KPI',
                'detail' => 'Target: ' . $kpi->target_value . ' • Current: ' . $kpi->current_value . ' ' . $kpi->unit,
                'path' => '/performance/kpis',
            ])
            ->all();
    }

    private function searchPerformanceGoals(Request $request, string $query): array
    {
        if (!$request->user()?->can('view performance') && !$request->user()?->can('manage performance')) {
            return [];
        }

        $like = '%' . $query . '%';
        return PerformanceGoal::query()
            ->with('employee:id,name,employee_number')
            ->when($request->user()?->company_id, function ($builder) use ($request): void {
                $builder->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->where(function ($builder) use ($like): void {
                $builder->where('title', 'like', $like)
                    ->orWhere('description', 'like', $like)
                    ->orWhere('status', 'like', $like)
                    ->orWhereHas('employee', function ($employeeQuery) use ($like): void {
                        $employeeQuery->where('name', 'like', $like)
                            ->orWhere('employee_number', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (PerformanceGoal $goal): array => [
                'id' => $goal->id,
                'title' => $goal->title,
                'subtitle' => $goal->employee?->name ?? 'Performance goal',
                'detail' => ucfirst((string) $goal->status) . ' • ' . $goal->progress . '% progress',
                'path' => '/performance/goals',
            ])
            ->all();
    }

    private function searchPerformanceAppraisals(Request $request, string $query): array
    {
        if (!$request->user()?->can('view performance') && !$request->user()?->can('manage performance')) {
            return [];
        }

        $like = '%' . $query . '%';
        return PerformanceAppraisal::query()
            ->with('employee:id,name,employee_number')
            ->when($request->user()?->company_id, function ($builder) use ($request): void {
                $builder->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->where(function ($builder) use ($like): void {
                $builder->where('cycle', 'like', $like)
                    ->orWhere('strengths', 'like', $like)
                    ->orWhere('improvements', 'like', $like)
                    ->orWhere('overall_score', 'like', $like)
                    ->orWhereHas('employee', function ($employeeQuery) use ($like): void {
                        $employeeQuery->where('name', 'like', $like)
                            ->orWhere('employee_number', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (PerformanceAppraisal $appraisal): array => [
                'id' => $appraisal->id,
                'title' => $appraisal->employee?->name ?? 'Performance appraisal',
                'subtitle' => $appraisal->cycle,
                'detail' => 'Overall score: ' . $appraisal->overall_score,
                'path' => '/performance/appraisals',
            ])
            ->all();
    }

    private function sanitizeQuery(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }
}
