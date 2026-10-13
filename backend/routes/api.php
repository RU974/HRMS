<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BackgroundRunController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\EmployeePromotionController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DesignationController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\EmployeeDocumentController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HolidayController;
use App\Http\Controllers\LeaveBlackoutController;
use App\Http\Controllers\LeaveController;
use App\Http\Controllers\LeaveTypeController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\PayrollProcessingController;
use App\Http\Controllers\PayslipController;
use App\Http\Controllers\BonusController;
use App\Http\Controllers\CommissionController;
use App\Http\Controllers\DeductionController;
use App\Http\Controllers\PerformanceAppraisalController;
use App\Http\Controllers\PerformanceGoalController;
use App\Http\Controllers\PerformanceKpiController;
use App\Http\Controllers\PerformanceMetaController;
use App\Http\Controllers\PerformanceReviewController;
use App\Http\Controllers\PerformanceReviewTemplateController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ShiftController;
use App\Http\Controllers\RolePermissionController;
use App\Http\Controllers\UserRoleController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\CompanySettingsController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\ThemeSettingsController;
use App\Http\Controllers\SystemLogController;
use App\Http\Controllers\LicenseController;
use App\Http\Controllers\WorkflowController;
use App\Http\Controllers\ApprovalController;
use App\Http\Controllers\ApprovalDelegationController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\CallController;
use App\Http\Controllers\ChatConversationController;
use App\Http\Controllers\ChatMessageController;
use App\Http\Controllers\Recruitment\CandidateBulkController as RecruitmentCandidateBulkController;
use App\Http\Controllers\Recruitment\EmailTemplateController as RecruitmentEmailTemplateController;
use App\Http\Controllers\Recruitment\HeadcountBudgetController as RecruitmentHeadcountBudgetController;
use App\Http\Controllers\Recruitment\CandidateController as RecruitmentCandidateController;
use App\Http\Controllers\Recruitment\CandidateDocumentController as RecruitmentCandidateDocumentController;
use App\Http\Controllers\Recruitment\CandidatePortalController as RecruitmentCandidatePortalController;
use App\Http\Controllers\Recruitment\CareersController as RecruitmentCareersController;
use App\Http\Controllers\Recruitment\CareersSettingsController as RecruitmentCareersSettingsController;
use App\Http\Controllers\Recruitment\CandidateCheckController as RecruitmentCandidateCheckController;
use App\Http\Controllers\Recruitment\JobQuestionController as RecruitmentJobQuestionController;
use App\Http\Controllers\Recruitment\PipelineController as RecruitmentPipelineController;
use App\Http\Controllers\Recruitment\ReferenceFormController as RecruitmentReferenceFormController;
use App\Http\Controllers\Recruitment\ReferralController as RecruitmentReferralController;
use App\Http\Controllers\Recruitment\RecruitmentAnalyticsController;
use App\Http\Controllers\Recruitment\RecruitmentDirectoryController;
use App\Http\Controllers\Recruitment\InterviewController as RecruitmentInterviewController;
use App\Http\Controllers\Recruitment\JobOpeningController as RecruitmentJobOpeningController;
use App\Http\Controllers\Recruitment\JobRequisitionController as RecruitmentJobRequisitionController;
use App\Http\Controllers\Recruitment\OfferController as RecruitmentOfferController;
use App\Http\Controllers\Recruitment\OnboardingController as RecruitmentOnboardingController;
use App\Http\Controllers\Recruitment\OnboardingTaskController as RecruitmentOnboardingTaskController;
use App\Http\Controllers\Recruitment\OnboardingTemplateController as RecruitmentOnboardingTemplateController;
use App\Http\Controllers\BiometricDeviceController;
use App\Http\Controllers\TaxBracketController;
use App\Http\Controllers\SalaryGradeController;
use App\Http\Controllers\SalaryIncrementController;
use App\Http\Controllers\LoanAdvanceController;
use App\Http\Controllers\InventoryCategoryController;
use App\Http\Controllers\InventoryItemController;
use App\Http\Controllers\InventoryAssignmentController;
use App\Http\Controllers\TicketController;
use App\Http\Controllers\TicketCommentController;
use App\Http\Controllers\TicketStatsController;
use App\Http\Controllers\OrbitController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

$registerRoutes = function (): void {
    // Public authentication routes
    Route::prefix('auth')->group(function () {
        // Local biometric agent — authenticated by shared secret, no session required
        Route::middleware('throttle:biometric-agent')->group(function (): void {
            Route::post('/biometric-agent/push', [BiometricDeviceController::class, 'agentPush']);
            Route::post('/biometric-agent/sync-users', [BiometricDeviceController::class, 'agentSyncUsers']);
            Route::post('/biometric-agent/discovered-devices', [BiometricDeviceController::class, 'agentDiscoverDevices']);
        });

        Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:auth');
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth');
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:auth');
        Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:auth');
    });

    // Public careers site: no authentication, rate limited, company resolved by slug only.
    Route::prefix('public/careers')->middleware('throttle:careers-read')->group(function () {
        Route::get('{slug}', [RecruitmentCareersController::class, 'company_profile']);
        Route::get('{slug}/jobs/{job}', [RecruitmentCareersController::class, 'job'])->whereNumber('job');
        Route::post('{slug}/jobs/{job}/apply', [RecruitmentCareersController::class, 'apply'])->whereNumber('job')->middleware('throttle:careers-apply');
        Route::post('{slug}/portal-link', [RecruitmentCareersController::class, 'portalLink'])->middleware('throttle:portal-link');
    });

    // Candidate portal: the secret token in the URL identifies the candidate, no account needed.
    Route::prefix('public/portal')->middleware('throttle:careers-read')->group(function () {
        Route::get('{token}', [RecruitmentCandidatePortalController::class, 'show']);
        Route::get('{token}/offer-pdf', [RecruitmentCandidatePortalController::class, 'offerPdf']);
        Route::get('{token}/documents/{document}/download', [RecruitmentCandidatePortalController::class, 'download'])->whereNumber('document');
        Route::post('{token}/offer', [RecruitmentCandidatePortalController::class, 'respondToOffer'])->middleware('throttle:portal-write');
        Route::post('{token}/documents', [RecruitmentCandidatePortalController::class, 'upload'])->middleware('throttle:portal-write');
        Route::post('{token}/offer/code', [RecruitmentCandidatePortalController::class, 'sendSigningCode'])->middleware('throttle:portal-code');
        Route::post('{token}/interviews/{interview}/reschedule', [RecruitmentCandidatePortalController::class, 'requestReschedule'])->whereNumber('interview')->middleware('throttle:portal-write');
        Route::post('{token}/withdraw', [RecruitmentCandidatePortalController::class, 'withdraw'])->middleware('throttle:portal-write');
        Route::post('{token}/messages', [RecruitmentCandidatePortalController::class, 'sendMessage'])->middleware('throttle:portal-write');
        Route::post('{token}/talent-pool', [RecruitmentCandidatePortalController::class, 'answerTalentPool'])->middleware('throttle:portal-write');
        Route::post('{token}/erase', [RecruitmentCandidatePortalController::class, 'erase'])->middleware('throttle:portal-write');
    });

    // Referees answer a reference request from an emailed private link.
    Route::prefix('public/references')->middleware('throttle:careers-read')->group(function () {
        Route::get('{token}', [RecruitmentReferenceFormController::class, 'show']);
        Route::post('{token}', [RecruitmentReferenceFormController::class, 'submit'])->middleware('throttle:portal-write');
    });

    // Protected routes - require authentication
    Route::middleware(['auth:sanctum', 'presence', 'audit.log'])->group(function () {
        // Authentication routes
        Route::prefix('auth')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout']);
            Route::get('/me', [AuthController::class, 'me']);
            Route::post('/refresh', [AuthController::class, 'refresh']);
            Route::post('/profile', [AuthController::class, 'updateProfile']);
            Route::post('/change-password', [AuthController::class, 'changePassword']);
        });

        // Company seat-meter — no special permission, any authenticated user needs this
        Route::get('company/usage', [LicenseController::class, 'selfUsage']);

        // Dashboard + reports (all protected with audit log)
        Route::get('dashboard/summary', [DashboardController::class, 'summary']);
        Route::get('dashboard/insights', [DashboardController::class, 'insights']);
        Route::get('dashboard/workspace', [DashboardController::class, 'workspace']);
        Route::get('search', [SearchController::class, 'index'])->middleware('throttle:search');
        Route::post('orbit/chat', [OrbitController::class, 'chat'])->middleware('throttle:orbit');
        Route::get('me/permissions', [RolePermissionController::class, 'myPermissions']);
        Route::get('settings/themes/current', [ThemeSettingsController::class, 'current']);
        Route::get('settings/themes/company', [ThemeSettingsController::class, 'company'])->middleware('permission:settings:manage_settings');
        Route::put('settings/themes/current', [ThemeSettingsController::class, 'saveCurrent']);
        Route::delete('settings/themes/current', [ThemeSettingsController::class, 'resetCurrent']);
        Route::middleware('permission:reports:view')->prefix('reports')->group(function () {
            Route::get('/employees', [ReportController::class, 'employees']);
            Route::get('/attendance', [ReportController::class, 'attendance']);
            Route::get('/leave', [ReportController::class, 'leave']);
            Route::get('/payroll', [ReportController::class, 'payroll']);
            Route::get('/inventory', [ReportController::class, 'inventory']);
            Route::get('/analytics', [ReportController::class, 'analytics']);
        });
        Route::middleware('permission:reports:view|reports:manage_settings')->apiResource('reports', ReportController::class);
        Route::middleware('permission:reports:manage_settings')->put('reports/{id}/schedule', [ReportController::class, 'updateSchedule']);

        Route::middleware('permission:settings:manage_settings')->group(function () {
            Route::get('permissions', [RolePermissionController::class, 'permissions']);
            Route::get('roles', [RolePermissionController::class, 'roles']);
            Route::post('roles', [RolePermissionController::class, 'storeRole']);
            Route::put('roles/{id}', [RolePermissionController::class, 'updateRole']);
            Route::delete('roles/{id}', [RolePermissionController::class, 'deleteRole']);
            Route::get('users/{id}/roles', [UserRoleController::class, 'getUserRoles']);
            Route::post('users/{id}/roles/assign', [UserRoleController::class, 'assignRole']);
            Route::delete('users/{id}/roles/remove', [UserRoleController::class, 'removeRole']);
            Route::put('users/{id}/roles/sync', [UserRoleController::class, 'syncRoles']);
            Route::put('users/{id}/roles', [UserRoleController::class, 'updateUserRoles']);
        });

        Route::middleware('permission:users:view')->group(function () {
            Route::apiResource('settings/users', UserManagementController::class);
        });

        Route::middleware('permission:settings:manage_settings')->group(function () {
            Route::apiResource('settings/companies', CompanySettingsController::class);
            Route::apiResource('settings/branches', BranchController::class);
            Route::apiResource('settings/themes', ThemeSettingsController::class);
            Route::middleware('permission:audit_logs:view')->group(function () {
                Route::get('settings/system-logs', [SystemLogController::class, 'index']);
                Route::get('settings/system-logs/{id}', [SystemLogController::class, 'show']);
            });
        });

        // ── Licensing ────────────────────────────────────────────────────────────
        // Intentionally outside the settings:manage_settings group so that any user
        // who holds a licenses:* permission can reach these endpoints without also
        // needing the broader settings:manage_settings permission.
        // Fine-grained per-action checks (licenses:view / create / edit / delete /
        // manage_settings) are enforced inside LicenseController itself.
        // Custom routes MUST come before apiResource so Laravel does not mistake
        // "usage", "all-usage", or "activate" for {license} UUID path segments.
        Route::middleware('permission:licenses:view|licenses:create|licenses:edit|licenses:delete|licenses:manage_settings')->group(function () {
            Route::get('settings/licenses/all-usage',          [LicenseController::class, 'allCompanyUsage']);
            Route::get('settings/licenses/usage',              [LicenseController::class, 'usage']);
            Route::get('settings/licenses/editions',           [LicenseController::class, 'editions']);
            // Throttle activation to 10 attempts per minute to prevent brute-force
            Route::post('settings/licenses/activate',          [LicenseController::class, 'activate'])->middleware('throttle:10,1');
            // Custom actions BEFORE apiResource so Laravel does not treat them as {license} UUID segments
            Route::post('settings/licenses/{id}/suspend',      [LicenseController::class, 'suspend']);
            Route::post('settings/licenses/{id}/unsuspend',    [LicenseController::class, 'unsuspend']);
            Route::post('settings/licenses/{id}/renew',        [LicenseController::class, 'renew']);
            Route::apiResource('settings/licenses',            LicenseController::class);
        });

        // Approvals & workflows — Professional+ feature
        Route::middleware('license.feature:approvals')->group(function () {
            Route::middleware('permission:approvals:view')->group(function () {
                Route::get('approvals', [ApprovalController::class, 'index']);
                Route::get('approvals/{id}', [ApprovalController::class, 'show']);
            });

            Route::middleware('permission:approvals:approve')->group(function () {
                Route::post('approvals/{id}/approve', [ApprovalController::class, 'approve']);
                Route::post('approvals/{id}/reject', [ApprovalController::class, 'reject']);
                Route::get('approval-delegations', [ApprovalDelegationController::class, 'index']);
                Route::post('approval-delegations', [ApprovalDelegationController::class, 'store']);
                Route::delete('approval-delegations/{id}', [ApprovalDelegationController::class, 'destroy']);
            });

            Route::middleware('permission:approvals:manage_settings')->group(function () {
                Route::post('approvals', [ApprovalController::class, 'store']);
                Route::apiResource('workflows', WorkflowController::class)->except(['create', 'edit']);
            });
        });

        // Employee routes
        Route::group([], function () {
            Route::get('employees/search', [EmployeeController::class, 'search']);
            Route::get('employees/department/{departmentId}', [EmployeeController::class, 'getByDepartment']);
            Route::post('employees/bulk-action', [EmployeeController::class, 'bulkAction']);
            Route::post('employees/export/csv', [EmployeeController::class, 'export']);
            Route::post('employees/import', [EmployeeController::class, 'import']);
            Route::post('employees/{id}/set-password', [EmployeeController::class, 'setUserPassword']);
            Route::apiResource('employees', EmployeeController::class);
            Route::get('employees/{employeeId}/promotions', [EmployeePromotionController::class, 'index']);
            Route::post('employees/{employeeId}/promotions', [EmployeePromotionController::class, 'store']);
            Route::delete('employees/{employeeId}/promotions/{id}', [EmployeePromotionController::class, 'destroy']);
        });

        // Background job tracking (payroll generation, employee import/export)
        Route::group([], function () {
            Route::get('background-runs/{id}', [BackgroundRunController::class, 'show']);
            Route::get('background-runs/{id}/download', [BackgroundRunController::class, 'download']);
        });

        // Department routes
        Route::middleware('permission:settings:manage_settings')->group(function () {
            Route::post('departments/{id}/restore', [DepartmentController::class, 'restore']);
            Route::delete('departments/{id}/force', [DepartmentController::class, 'forceDelete']);
        });
        // Bulk employee reassignment: dedicated employees:manage_settings permission (see migration 2026_06_23_000002).
        // settings:manage_settings was considered but it grants IT Support access, which is incorrect for this HR action.
        // HR Manager needs this and does not hold settings:manage_settings.
        Route::middleware('permission:employees:manage_settings')->post('departments/{id}/reassign-employees', [DepartmentController::class, 'reassignEmployees']);
        Route::get('departments/export', [DepartmentController::class, 'export']);
        Route::post('departments/import', [DepartmentController::class, 'import']);
        Route::apiResource('departments', DepartmentController::class);

        // Designation routes
        Route::get('designations/export', [DesignationController::class, 'export']);
        Route::post('designations/import', [DesignationController::class, 'import']);
        Route::apiResource('designations', DesignationController::class);

        // Attendance routes
        Route::group([], function () {
            Route::get('attendance/employee/{employeeId}', [AttendanceController::class, 'getByEmployee']);
            Route::get('attendance/monthly-stats/{employeeId}/{month}/{year}', [AttendanceController::class, 'getMonthlyStats']);
            Route::get('attendance/company-monthly-summary', [AttendanceController::class, 'companyMonthlySummary']);
            Route::get('attendance/team-daily', [AttendanceController::class, 'teamDailyView']);
            Route::get('attendance/export', [AttendanceController::class, 'export']);
            Route::post('attendance/import', [AttendanceController::class, 'import']);
            Route::get('attendance/corrections',[AttendanceController::class, 'listCorrections']);
            Route::post('attendance/{attendance}/request-correction', [AttendanceController::class, 'requestCorrection']);
            Route::post('attendance/{attendance}/review-correction', [AttendanceController::class, 'reviewCorrection']);
            Route::apiResource('attendance', AttendanceController::class);
        });
        Route::middleware('permission:attendance:manage_settings')->group(function () {
            Route::get('attendance/policy', [AttendanceController::class, 'getPolicy']);
            Route::put('attendance/policy', [AttendanceController::class, 'updatePolicy']);
        });
        Route::post('attendance/check-in', [AttendanceController::class, 'checkIn']);
        Route::post('attendance/check-out', [AttendanceController::class, 'checkOut']);

        // Biometric device routes
        Route::middleware('permission:biometric:view')->group(function () {
        Route::get('biometric-devices', [BiometricDeviceController::class, 'index']);
        Route::get('biometric-devices/sync-logs', [BiometricDeviceController::class, 'syncLogs']);
        Route::get('biometric-devices/unconfigured', [BiometricDeviceController::class, 'listUnconfigured']);
        Route::post('biometric-devices/{id}/claim', [BiometricDeviceController::class, 'claimDevice']);
        Route::get('biometric-devices/{id}', [BiometricDeviceController::class, 'show']);
        });
        Route::middleware('permission:biometric:create')->post('biometric-devices', [BiometricDeviceController::class, 'store']);
        Route::middleware('permission:biometric:edit')->group(function () {
        Route::put('biometric-devices/{id}', [BiometricDeviceController::class, 'update']);
        Route::post('biometric-devices/{id}/test-connection', [BiometricDeviceController::class, 'testConnection']);
        Route::post('biometric-devices/{id}/regenerate-token', [BiometricDeviceController::class, 'regenerateAgentToken']);
        });
        Route::middleware('permission:biometric:delete')->delete('biometric-devices/{id}', [BiometricDeviceController::class, 'destroy']);
        Route::middleware('permission:biometric:sync')->post('biometric-devices/{id}/sync', [BiometricDeviceController::class, 'sync']);
        Route::middleware('permission:biometric:manage_mapping')->group(function () {
        Route::get('biometric-devices/{id}/mappings', [BiometricDeviceController::class, 'mappings']);
        Route::get('biometric-devices/{id}/device-users', [BiometricDeviceController::class, 'listDeviceUsers']);
        Route::get('biometric-devices/{id}/mappings/auto-match', [BiometricDeviceController::class, 'autoMatch']);
        Route::post('biometric-devices/{id}/mappings/bulk-import', [BiometricDeviceController::class, 'bulkImportMappings']);
        Route::post('biometric-devices/mappings', [BiometricDeviceController::class, 'saveMapping']);
        Route::delete('biometric-devices/mappings/{id}', [BiometricDeviceController::class, 'deleteMapping']);
        });

        // Employee document routes
        Route::group([], function () {
            Route::get('employee-documents/{id}/preview', [EmployeeDocumentController::class, 'preview']);
            Route::get('employee-documents/{id}/download', [EmployeeDocumentController::class, 'download']);
            Route::apiResource('employee-documents', EmployeeDocumentController::class);
        });

        // Payroll routes — Professional+ feature
        Route::middleware('license.feature:payroll')->group(function () {
            Route::get('payroll/employee/{employeeId}', [PayrollController::class, 'getByEmployee']);
            Route::get('payroll/summary/monthly', [PayrollController::class, 'getMonthlySummary']);
            Route::middleware('permission:payroll:manage_settings')->group(function () {
                Route::get('payroll/bank-export', [PayrollController::class, 'bankExport']);
                Route::get('payroll/summary-pdf', [PayrollController::class, 'summaryPdf']);
            });
            Route::apiResource('payroll', PayrollController::class);
            Route::get('payslips/{id}/pdf', [PayslipController::class, 'downloadPdf']);
            Route::apiResource('payslips', PayslipController::class);
            Route::apiResource('bonuses', BonusController::class);
            Route::apiResource('commissions', CommissionController::class)->only(['index', 'store', 'destroy']);
            Route::apiResource('deductions', DeductionController::class);
            Route::middleware('permission:payroll:manage_settings')->group(function () {
                Route::post('payroll/generate', [PayrollController::class, 'generatePayroll']);
                Route::post('payroll/{id}/mark-paid', [PayrollController::class, 'markAsPaid']);
                Route::post('payroll/{id}/approve', [PayrollController::class, 'approvePayroll']);
                Route::post('payroll/{id}/reject', [PayrollController::class, 'rejectPayroll']);
                Route::post('salary-slips/from-payroll', [PayslipController::class, 'createFromPayroll']);
                Route::apiResource('payroll-processings', PayrollProcessingController::class);
                Route::apiResource('tax-brackets', TaxBracketController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('salary-grades', SalaryGradeController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('salary-increments', SalaryIncrementController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('loan-advances', LoanAdvanceController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('employee-bank-accounts', \App\Http\Controllers\EmployeeBankAccountController::class)->only(['index', 'store', 'update', 'destroy']);
            });
        });

        // Leave routes
        // Read endpoints (index, show): employees with leaves:create can see their own
        // records (controller scopes them); managers/HR need leaves:view or leaves:approve.
        // Write endpoints (store): leaves:create for own requests, leaves:approve for others.
        // Update/delete: leaves:approve or leaves:manage_settings.
        // Using a broad OR-gate here as defence-in-depth; fine-grained checks remain in
        // the controller — this layer ensures unauthenticated / zero-permission requests
        // are rejected at the route level before reaching any controller logic.
        Route::middleware('permission:leaves:create|leaves:view|leaves:approve|leaves:manage_settings')
            ->group(function () {
                Route::get('leaves/team-calendar',   [LeaveController::class, 'teamCalendar']);
                Route::get('leaves/balance-summary', [LeaveController::class, 'balanceSummary']);
                Route::get('leaves/encashment',      [LeaveController::class, 'encashment']);
                Route::apiResource('leaves', LeaveController::class);
            });

        // Attendance/Leave setup routes
        Route::middleware('permission:attendance:edit')->group(function () {
            Route::apiResource('holidays', HolidayController::class);
            Route::apiResource('shifts', ShiftController::class);
        });

        // Leave-types READ: any user that can interact with leaves needs to load
        // the type list to populate the leave-request form dropdown.
        // WRITE ops remain restricted to attendance admins / leave settings managers.
        Route::middleware('permission:leaves:create|leaves:view|leaves:approve|leaves:manage_settings|attendance:edit')
            ->group(function () {
                Route::apiResource('leave-types', LeaveTypeController::class)
                    ->only(['index', 'show']);
            });
        Route::middleware('permission:attendance:edit|leaves:manage_settings')
            ->group(function () {
                Route::apiResource('leave-types', LeaveTypeController::class)
                    ->only(['store', 'update', 'destroy']);
                Route::apiResource('leave-blackouts', LeaveBlackoutController::class)
                    ->only(['index', 'store', 'destroy']);
            });

        // Recruitment routes — Enterprise feature
        Route::middleware('license.feature:recruitment')->group(function () {
            // Offer decisions are made by approvers (HR Manager / Company Admin), who need approvals:approve rather than recruitment access.
            Route::middleware('permission:approvals:approve')->group(function () {
                Route::post('offers/{offer}/approve', [RecruitmentOfferController::class, 'approve']);
                Route::post('offers/{offer}/reject', [RecruitmentOfferController::class, 'reject']);
                Route::post('job-openings/{job}/approve', [RecruitmentJobOpeningController::class, 'approveRequisition'])->whereNumber('job');
                Route::post('job-openings/{job}/reject', [RecruitmentJobOpeningController::class, 'rejectRequisition'])->whereNumber('job');
            });

            // Hiring managers raise requisitions for new roles; they go live once approved.
            Route::middleware('permission:recruitment:request|recruitment:create')->group(function () {
                Route::get('requisitions', [RecruitmentJobRequisitionController::class, 'mine']);
                Route::get('requisitions/departments', [RecruitmentJobRequisitionController::class, 'departments']);
                Route::post('requisitions', [RecruitmentJobRequisitionController::class, 'store']);
                Route::post('requisitions/budget-check', [RecruitmentHeadcountBudgetController::class, 'check']);
                Route::put('requisitions/{job}', [RecruitmentJobRequisitionController::class, 'update'])->whereNumber('job');
                Route::post('requisitions/{job}/submit', [RecruitmentJobRequisitionController::class, 'resubmit'])->whereNumber('job');
                Route::post('requisitions/{job}/withdraw', [RecruitmentJobRequisitionController::class, 'withdrawRequisition'])->whereNumber('job');
            });

            // Employees can put someone forward for an open job and follow their own referrals.
            Route::middleware('permission:recruitment:refer')->group(function () {
                Route::get('referrals/jobs', [RecruitmentReferralController::class, 'openJobs']);
                Route::get('referrals/mine', [RecruitmentReferralController::class, 'mine']);
                Route::post('referrals', [RecruitmentReferralController::class, 'submit']);
            });

            // Assignees without recruitment access can see and complete their own onboarding tasks.
            Route::middleware('permission:recruitment:view|recruitment:onboarding_task')->group(function () {
                Route::get('onboarding-tasks', [RecruitmentOnboardingTaskController::class, 'index']);
                Route::post('onboarding-tasks/{task}/complete', [RecruitmentOnboardingTaskController::class, 'complete']);
                Route::post('onboarding-tasks/{task}/reopen', [RecruitmentOnboardingTaskController::class, 'reopen']);
            });

            // Interviewers without recruitment access can see and score their own interviews.
            Route::middleware('permission:recruitment:view|recruitment:interview')->group(function () {
                Route::get('interviews', [RecruitmentInterviewController::class, 'index']);
                Route::get('interviews/{interview}', [RecruitmentInterviewController::class, 'show']);
                Route::post('interviews/{interview}/scorecard', [RecruitmentInterviewController::class, 'submitScorecard']);
            });

            Route::middleware('permission:recruitment:view')->group(function () {
                Route::get('recruitment/pipeline-summary', [RecruitmentCandidateController::class, 'pipelineSummary']);
                Route::get('recruitment/pipeline', [RecruitmentPipelineController::class, 'show']);
                Route::get('recruitment/agencies', [RecruitmentReferralController::class, 'agencies']);
                Route::get('recruitment/referral-bonuses', [RecruitmentReferralController::class, 'bonuses']);
                Route::get('job-openings/{job}/questions', [RecruitmentJobQuestionController::class, 'show'])->whereNumber('job');
                Route::get('candidates/{candidate}/checks', [RecruitmentCandidateCheckController::class, 'index']);
                Route::get('recruitment/stats', [RecruitmentCandidateController::class, 'stats']);
                Route::get('recruitment/board', [RecruitmentCandidateController::class, 'board']);
                Route::get('recruitment/overview', [RecruitmentAnalyticsController::class, 'overview']);
                Route::get('recruitment/people', [RecruitmentDirectoryController::class, 'people']);
                Route::get('recruitment/analytics', [RecruitmentAnalyticsController::class, 'analytics']);
                Route::get('recruitment/careers-settings', [RecruitmentCareersSettingsController::class, 'show']);
                Route::get('candidates/{candidate}/resume', [RecruitmentCandidateController::class, 'downloadResume']);
                Route::get('candidates/{candidate}/notes', [RecruitmentCandidateController::class, 'notes']);
                Route::get('candidates/{candidate}/messages', [RecruitmentCandidateController::class, 'messages']);
                Route::get('candidates/{candidate}/reschedule-requests', [RecruitmentCandidateController::class, 'rescheduleRequests']);
                Route::get('job-openings/{job}/suggested-candidates', [RecruitmentJobOpeningController::class, 'suggestedCandidates'])->whereNumber('job');
                Route::get('email-templates', [RecruitmentEmailTemplateController::class, 'index']);
                Route::get('recruitment/headcount', [RecruitmentHeadcountBudgetController::class, 'index']);
                Route::get('recruitment/headcount/departments', [RecruitmentHeadcountBudgetController::class, 'departments']);
                Route::get('recruitment/currency', [RecruitmentHeadcountBudgetController::class, 'currency']);
                Route::get('candidates/{candidate}/documents', [RecruitmentCandidateDocumentController::class, 'index']);
                Route::get('candidates/{candidate}/documents/{document}/download', [RecruitmentCandidateDocumentController::class, 'download'])->whereNumber('document');
                Route::get('offers', [RecruitmentOfferController::class, 'index']);
                Route::get('offers/{offer}', [RecruitmentOfferController::class, 'show']);
                Route::get('offers/{offer}/pdf', [RecruitmentOfferController::class, 'pdf']);
                Route::get('offers/{offer}/signature-verification', [RecruitmentOfferController::class, 'verifySignature']);
                Route::get('onboarding-templates', [RecruitmentOnboardingTemplateController::class, 'index']);
                Route::get('onboarding-templates/{template}', [RecruitmentOnboardingTemplateController::class, 'show']);
                Route::apiResource('job-openings', RecruitmentJobOpeningController::class)->only(['index', 'show']);
                Route::apiResource('candidates', RecruitmentCandidateController::class)->only(['index', 'show']);
                Route::apiResource('onboarding', RecruitmentOnboardingController::class)->only(['index', 'show']);
            });

            Route::middleware('permission:recruitment:create|recruitment:edit|recruitment:delete')->group(function () {
                Route::post('candidates/{candidate}/hire', [RecruitmentCandidateController::class, 'hire']);
                Route::put('recruitment/pipeline', [RecruitmentPipelineController::class, 'save']);
                Route::delete('recruitment/pipeline', [RecruitmentPipelineController::class, 'reset']);
                Route::put('job-openings/{job}/questions', [RecruitmentJobQuestionController::class, 'save'])->whereNumber('job');
                Route::post('candidates/{candidate}/checks', [RecruitmentCandidateCheckController::class, 'store']);
                Route::put('candidate-checks/{check}', [RecruitmentCandidateCheckController::class, 'update'])->whereNumber('check');
                Route::post('candidate-checks/{check}/waive', [RecruitmentCandidateCheckController::class, 'waive'])->whereNumber('check');
                Route::post('candidate-checks/{check}/send-request', [RecruitmentCandidateCheckController::class, 'sendRequest'])->whereNumber('check');
                Route::delete('candidate-checks/{check}', [RecruitmentCandidateCheckController::class, 'destroy'])->whereNumber('check');
                Route::post('recruitment/agencies', [RecruitmentReferralController::class, 'storeAgency']);
                Route::put('recruitment/agencies/{agency}', [RecruitmentReferralController::class, 'updateAgency'])->whereNumber('agency');
                Route::delete('recruitment/agencies/{agency}', [RecruitmentReferralController::class, 'destroyAgency'])->whereNumber('agency');
                Route::put('recruitment/referral-bonuses/{bonus}', [RecruitmentReferralController::class, 'updateBonus'])->whereNumber('bonus');
                Route::post('recruitment/referral-bonuses/{bonus}/approve', [RecruitmentReferralController::class, 'approveBonus'])->whereNumber('bonus');
                Route::post('recruitment/referral-bonuses/{bonus}/pay', [RecruitmentReferralController::class, 'payBonus'])->whereNumber('bonus');
                Route::post('recruitment/referral-bonuses/{bonus}/cancel', [RecruitmentReferralController::class, 'cancelBonus'])->whereNumber('bonus');
                Route::patch('candidates/{candidate}/stage', [RecruitmentCandidateController::class, 'changeStage']);
                Route::put('recruitment/careers-settings', [RecruitmentCareersSettingsController::class, 'update']);
                Route::post('candidates/{candidate}/resume', [RecruitmentCandidateController::class, 'uploadResume']);
                Route::post('candidates/{candidate}/resume/parse', [RecruitmentCandidateController::class, 'reparseResume']);
                Route::post('recruitment/resume-parse', [RecruitmentCandidateController::class, 'parseResume']);
                Route::post('candidates/{candidate}/portal-link', [RecruitmentCandidateController::class, 'portalLink']);
                Route::post('candidates/{candidate}/talent-pool', [RecruitmentCandidateController::class, 'addToTalentPool']);
                Route::delete('candidates/{candidate}/talent-pool', [RecruitmentCandidateController::class, 'removeFromTalentPool']);
                Route::post('candidates/{candidate}/consider', [RecruitmentCandidateController::class, 'considerForJob']);
                Route::post('candidates/bulk', [RecruitmentCandidateBulkController::class, 'apply']);
                Route::get('candidates/bulk-runs/{run}', [RecruitmentCandidateBulkController::class, 'run'])->whereNumber('run');
                Route::post('candidates/{candidate}/merge', [RecruitmentCandidateController::class, 'merge']);
                Route::post('candidates/{candidate}/erase', [RecruitmentCandidateController::class, 'erase']);
                Route::post('candidates/{candidate}/messages', [RecruitmentCandidateController::class, 'sendMessage']);
                Route::post('candidates/{candidate}/talent-pool/consent-request', [RecruitmentCandidateController::class, 'requestPoolConsent']);
                Route::post('reschedule-requests/{request}/decline', [RecruitmentCandidateController::class, 'declineReschedule'])->whereNumber('request');
                Route::post('email-templates/starters', [RecruitmentEmailTemplateController::class, 'addStarters']);
                Route::apiResource('email-templates', RecruitmentEmailTemplateController::class)->only(['store', 'update', 'destroy']);
                Route::put('recruitment/headcount', [RecruitmentHeadcountBudgetController::class, 'upsert']);
                Route::put('recruitment/currency', [RecruitmentHeadcountBudgetController::class, 'saveCurrency']);
                Route::delete('recruitment/headcount/{id}', [RecruitmentHeadcountBudgetController::class, 'destroy'])->whereNumber('id');
                Route::post('candidates/import', [RecruitmentCandidateBulkController::class, 'import']);
                Route::post('candidates/{candidate}/documents', [RecruitmentCandidateDocumentController::class, 'store']);
                Route::post('candidates/{candidate}/documents/request', [RecruitmentCandidateDocumentController::class, 'requestDocuments']);
                Route::post('candidates/{candidate}/documents/{document}/review', [RecruitmentCandidateDocumentController::class, 'review'])->whereNumber('document');
                Route::delete('candidates/{candidate}/documents/{document}', [RecruitmentCandidateDocumentController::class, 'destroy'])->whereNumber('document');
                Route::delete('candidates/{candidate}/resume', [RecruitmentCandidateController::class, 'deleteResume']);
                Route::post('candidates/{candidate}/notes', [RecruitmentCandidateController::class, 'addNote']);
                Route::apiResource('offers', RecruitmentOfferController::class)->only(['store', 'update', 'destroy']);
                Route::apiResource('onboarding-tasks', RecruitmentOnboardingTaskController::class)->only(['store', 'update', 'destroy']);
                Route::apiResource('onboarding-templates', RecruitmentOnboardingTemplateController::class)->only(['store', 'update', 'destroy']);
                Route::post('job-openings/{job}/submit', [RecruitmentJobOpeningController::class, 'submitRequisition'])->whereNumber('job');
                Route::post('offers/{offer}/submit', [RecruitmentOfferController::class, 'submit']);
                Route::post('offers/{offer}/send', [RecruitmentOfferController::class, 'send']);
                Route::post('offers/{offer}/respond', [RecruitmentOfferController::class, 'respond']);
                Route::post('offers/{offer}/withdraw', [RecruitmentOfferController::class, 'withdraw']);
                Route::delete('candidates/{candidate}/notes/{note}', [RecruitmentCandidateController::class, 'deleteNote']);
                Route::apiResource('job-openings', RecruitmentJobOpeningController::class)->except(['index', 'show']);
                Route::apiResource('candidates', RecruitmentCandidateController::class)->except(['index', 'show']);
                Route::post('interviews/{interview}/cancel', [RecruitmentInterviewController::class, 'cancel']);
                Route::apiResource('interviews', RecruitmentInterviewController::class)->except(['index', 'show']);
                Route::apiResource('onboarding', RecruitmentOnboardingController::class)->except(['index', 'show']);
            });
        });

        // Communication routes — Professional+ feature
        Route::middleware('license.feature:communication')->group(function () {
            Route::middleware('throttle:communication')->apiResource('announcements', AnnouncementController::class);
            Route::middleware('throttle:communication')->group(function () {
                Route::post('announcements/upload-image', [AnnouncementController::class, 'uploadImage']);
                Route::post('announcements/{id}/read', [AnnouncementController::class, 'markRead']);
                Route::get('announcements/{id}/reads', [AnnouncementController::class, 'reads']);
            });
            Route::middleware('throttle:communication')->apiResource('notifications', NotificationController::class);
            Route::middleware('throttle:communication')->group(function () {
                Route::get('chat-messages/users', [ChatMessageController::class, 'users']);
                Route::get('chat-messages/{id}/attachment', [ChatMessageController::class, 'downloadAttachment']);
                Route::post('chat-messages', [ChatMessageController::class, 'store'])->middleware('throttle:chat-send');
                Route::apiResource('chat-messages', ChatMessageController::class)->except(['store']);
                Route::apiResource('chat-conversations', ChatConversationController::class)->only(['index', 'store', 'show', 'update']);
                Route::post('chat-conversations/{id}/read', [ChatConversationController::class, 'markRead']);
                Route::post('chat-conversations/{id}/leave', [ChatConversationController::class, 'leave']);
                Route::post('chat-conversations/{id}/participants', [ChatConversationController::class, 'addParticipant']);
                Route::delete('chat-conversations/{id}/participants/{userId}', [ChatConversationController::class, 'removeParticipant']);

                // Presence
                Route::post('users/online-status', [CallController::class, 'onlineStatus']);
                Route::post('presence/ping', [CallController::class, 'ping']);

                // Calling — read-only lookups
                Route::get('calls/config', [CallController::class, 'config']);
                Route::get('calls/current', [CallController::class, 'current']);
                Route::get('calls/history', [CallController::class, 'history']);
                Route::get('calls/{id}', [CallController::class, 'show']);
            });

            // Calling — state changes. Kept out of the shared 60/min bucket:
            // signalling fires one request per ICE candidate.
            Route::middleware('throttle:call-action')->group(function () {
                Route::post('calls', [CallController::class, 'initiate']);
                Route::post('calls/{id}/answer', [CallController::class, 'answer']);
                Route::post('calls/{id}/reject', [CallController::class, 'reject']);
                Route::post('calls/{id}/end', [CallController::class, 'end']);
                Route::post('calls/{id}/participants', [CallController::class, 'addParticipant']);
                Route::delete('calls/{id}/participants/{userId}', [CallController::class, 'removeParticipant']);
                Route::post('calls/{id}/participants/{userId}/mute', [CallController::class, 'muteParticipant']);
            });

            Route::middleware('throttle:call-signal')->group(function () {
                Route::post('calls/{id}/signals', [CallController::class, 'sendSignal']);
                Route::get('calls/{id}/signals', [CallController::class, 'getSignals']);
                Route::post('calls/{id}/heartbeat', [CallController::class, 'heartbeat']);
                Route::post('calls/{id}/media-state', [CallController::class, 'mediaState']);
            });
        });

        // Inventory routes
        Route::middleware('permission:inventory:view|inventory:create|inventory:edit|inventory:delete|inventory:manage_settings')->group(function () {
            Route::post('inventory/categories/import', [InventoryCategoryController::class, 'import']);
            Route::apiResource('inventory/categories', InventoryCategoryController::class)->except(['show', 'create', 'edit']);
            Route::post('inventory/items/import', [InventoryItemController::class, 'import']);
            Route::post('inventory/items/{id}/restore', [InventoryItemController::class, 'restore']);
            Route::apiResource('inventory/items', InventoryItemController::class)->except(['create', 'edit']);
            Route::post('inventory/assignments/{id}/return', [InventoryAssignmentController::class, 'return']);
            Route::apiResource('inventory/assignments', InventoryAssignmentController::class)->only(['index', 'store']);
        });

        // Ticketing routes
        Route::middleware(['throttle:communication', 'permission:tickets:view|tickets:create|tickets:edit|tickets:delete|tickets:assign|tickets:manage_settings'])->group(function () {
            // Stats must be declared before apiResource to avoid matching 'stats' as {id}
            Route::get('tickets/stats', [TicketStatsController::class, 'index']);
            Route::get('tickets/{id}/assignable-users', [TicketController::class, 'assignableUsers']);
            Route::post('tickets/{id}/assign', [TicketController::class, 'assign']);
            Route::post('tickets/{id}/status', [TicketController::class, 'changeStatus']);
            Route::post('tickets/{ticketId}/comments', [TicketCommentController::class, 'store']);
            Route::post('tickets/{ticketId}/attachments', [TicketController::class, 'uploadAttachment']);
            Route::get('tickets/{ticketId}/attachments/{attachmentId}/download', [TicketController::class, 'downloadAttachment']);
            Route::apiResource('tickets', TicketController::class);
        });

        // Performance routes — Professional+ feature
        Route::middleware(['license.feature:performance', 'permission:performance:view|performance:manage_settings'])->group(function () {
            Route::apiResource('performance-reviews', PerformanceReviewController::class);
            Route::apiResource('performance-kpis', PerformanceKpiController::class);
            Route::apiResource('performance-goals', PerformanceGoalController::class);
            Route::post('performance-appraisals/bulk-approve', [PerformanceAppraisalController::class, 'bulkApprove']);
            Route::get('performance-appraisals/export', [PerformanceAppraisalController::class, 'export']);
            Route::apiResource('performance-appraisals', PerformanceAppraisalController::class);
            Route::apiResource('performance-review-templates', PerformanceReviewTemplateController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::get('performance/meta/employees', [PerformanceMetaController::class, 'employees']);
            Route::get('performance/meta/trend/{employeeId}', [PerformanceMetaController::class, 'trend']);
        });
    });
};

Route::get('/', function () {
    return response()->json([
        'success' => true,
        'message' => 'HRMS API v1',
        'version' => 'v1',
    ]);
});

// Broadcasting auth for private WebSocket channels (Reverb).
// Must live at /api/broadcasting/auth (no v1 prefix) to match echo.ts authorizer.
Route::post('/broadcasting/auth', function (Request $request) {
    return \Illuminate\Support\Facades\Broadcast::auth($request);
})->middleware('auth:sanctum');

Route::prefix('v1')->group($registerRoutes);