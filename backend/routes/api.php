<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
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
use App\Http\Controllers\DeductionController;
use App\Http\Controllers\PerformanceAppraisalController;
use App\Http\Controllers\PerformanceGoalController;
use App\Http\Controllers\PerformanceKpiController;
use App\Http\Controllers\PerformanceMetaController;
use App\Http\Controllers\PerformanceReviewController;
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
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ChatMessageController;
use App\Http\Controllers\Recruitment\CandidateController as RecruitmentCandidateController;
use App\Http\Controllers\Recruitment\InterviewController as RecruitmentInterviewController;
use App\Http\Controllers\Recruitment\JobOpeningController as RecruitmentJobOpeningController;
use App\Http\Controllers\Recruitment\OnboardingController as RecruitmentOnboardingController;
use App\Http\Controllers\BiometricDeviceController;
use App\Http\Controllers\TaxBracketController;
use App\Http\Controllers\SalaryGradeController;
use App\Http\Controllers\SalaryIncrementController;
use App\Http\Controllers\LoanAdvanceController;

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
        Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:auth');
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth');
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:auth');
        Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:auth');
    });

    // Protected routes - require authentication
    Route::middleware(['auth:sanctum', 'audit.log'])->group(function () {
        // Authentication routes
        Route::prefix('auth')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout']);
            Route::get('/me', [AuthController::class, 'me']);
            Route::post('/refresh', [AuthController::class, 'refresh']);
        });

        // Dashboard + reports (all protected with audit log)
        Route::get('dashboard/summary', [DashboardController::class, 'summary']);
        Route::get('dashboard/insights', [DashboardController::class, 'insights']);
        Route::get('dashboard/workspace', [DashboardController::class, 'workspace']);
        Route::get('search', [SearchController::class, 'index'])->middleware('throttle:search');
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
            Route::get('/analytics', [ReportController::class, 'analytics']);
        });
        Route::middleware('permission:reports:view|reports:manage_settings')->apiResource('reports', ReportController::class);

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
            // Throttle activation to 10 attempts per minute to prevent brute-force
            Route::post('settings/licenses/activate',          [LicenseController::class, 'activate'])->middleware('throttle:10,1');
            // Custom actions BEFORE apiResource so Laravel does not treat them as {license} UUID segments
            Route::post('settings/licenses/{id}/suspend',      [LicenseController::class, 'suspend']);
            Route::post('settings/licenses/{id}/unsuspend',    [LicenseController::class, 'unsuspend']);
            Route::apiResource('settings/licenses',            LicenseController::class);
        });

        Route::middleware('permission:approvals:view')->group(function () {
            Route::get('approvals', [ApprovalController::class, 'index']);
            Route::get('approvals/{id}', [ApprovalController::class, 'show']);
        });

        Route::middleware('permission:approvals:manage_settings')->group(function () {
            Route::post('approvals', [ApprovalController::class, 'store']);
            Route::post('approvals/{id}/approve', [ApprovalController::class, 'approve']);
            Route::post('approvals/{id}/reject', [ApprovalController::class, 'reject']);
            Route::apiResource('workflows', WorkflowController::class)->except(['create', 'edit']);
        });

        // Employee routes
        Route::group([], function () {
            Route::get('employees/search', [EmployeeController::class, 'search']);
            Route::get('employees/department/{departmentId}', [EmployeeController::class, 'getByDepartment']);
            Route::post('employees/bulk-action', [EmployeeController::class, 'bulkAction']);
            Route::get('employees/export/csv', [EmployeeController::class, 'export']);
            Route::post('employees/import', [EmployeeController::class, 'import']);
            Route::post('employees/{id}/set-password', [EmployeeController::class, 'setUserPassword']);
            Route::apiResource('employees', EmployeeController::class);
            Route::get('employees/{employeeId}/promotions', [EmployeePromotionController::class, 'index']);
            Route::post('employees/{employeeId}/promotions', [EmployeePromotionController::class, 'store']);
            Route::delete('employees/{employeeId}/promotions/{id}', [EmployeePromotionController::class, 'destroy']);
        });

        // Department routes
        Route::middleware('permission:settings:manage_settings')->group(function () {
            Route::post('departments/{id}/restore', [DepartmentController::class, 'restore']);
            Route::delete('departments/{id}/force', [DepartmentController::class, 'forceDelete']);
        });
        Route::middleware('permission:employees:manage_settings')->post('departments/{id}/reassign-employees', [DepartmentController::class, 'reassignEmployees']);
        Route::apiResource('departments', DepartmentController::class);

        // Designation routes
        Route::apiResource('designations', DesignationController::class);

        // Attendance routes
        Route::group([], function () {
            Route::get('attendance/employee/{employeeId}', [AttendanceController::class, 'getByEmployee']);
            Route::get('attendance/monthly-stats/{employeeId}/{month}/{year}', [AttendanceController::class, 'getMonthlyStats']);
            Route::get('attendance/company-monthly-summary', [AttendanceController::class, 'companyMonthlySummary']);
            Route::get('attendance/team-daily', [AttendanceController::class, 'teamDailyView']);
            Route::get('attendance/corrections', [AttendanceController::class, 'listCorrections']);
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
        Route::get('biometric-devices/{id}', [BiometricDeviceController::class, 'show']);
        });
        Route::middleware('permission:biometric:create')->post('biometric-devices', [BiometricDeviceController::class, 'store']);
        Route::middleware('permission:biometric:edit')->group(function () {
        Route::put('biometric-devices/{id}', [BiometricDeviceController::class, 'update']);
        Route::post('biometric-devices/{id}/test-connection', [BiometricDeviceController::class, 'testConnection']);
        });
        Route::middleware('permission:biometric:delete')->delete('biometric-devices/{id}', [BiometricDeviceController::class, 'destroy']);
        Route::middleware('permission:biometric:sync')->post('biometric-devices/{id}/sync', [BiometricDeviceController::class, 'sync']);
        Route::middleware('permission:biometric:manage_mapping')->group(function () {
        Route::get('biometric-devices/{id}/mappings', [BiometricDeviceController::class, 'mappings']);
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
            Route::apiResource('payroll', PayrollController::class);
            Route::apiResource('payslips', PayslipController::class);
            Route::apiResource('bonuses', BonusController::class);
            Route::apiResource('deductions', DeductionController::class);
            Route::middleware('permission:payroll:manage_settings')->group(function () {
                Route::post('payroll/generate', [PayrollController::class, 'generatePayroll']);
                Route::post('payroll/{id}/mark-paid', [PayrollController::class, 'markAsPaid']);
                Route::post('payroll/{id}/approve', [PayrollController::class, 'approvePayroll']);
                Route::get('payroll/bank-export', [PayrollController::class, 'bankExport']);
                Route::post('salary-slips/from-payroll', [PayslipController::class, 'createFromPayroll']);
                Route::apiResource('payroll-processings', PayrollProcessingController::class);
                Route::apiResource('tax-brackets', TaxBracketController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('salary-grades', SalaryGradeController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('salary-increments', SalaryIncrementController::class)->only(['index', 'store', 'update', 'destroy']);
                Route::apiResource('loan-advances', LoanAdvanceController::class)->only(['index', 'store', 'update', 'destroy']);
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
            Route::middleware('permission:recruitment:view')->group(function () {
                Route::get('recruitment/pipeline-summary', [RecruitmentCandidateController::class, 'pipelineSummary']);
                Route::apiResource('job-openings', RecruitmentJobOpeningController::class)->only(['index', 'show']);
                Route::apiResource('candidates', RecruitmentCandidateController::class)->only(['index', 'show']);
                Route::apiResource('interviews', RecruitmentInterviewController::class)->only(['index', 'show']);
                Route::apiResource('onboarding', RecruitmentOnboardingController::class)->only(['index', 'show']);
            });

            Route::middleware('permission:recruitment:create|recruitment:edit|recruitment:delete')->group(function () {
                Route::apiResource('job-openings', RecruitmentJobOpeningController::class)->except(['index', 'show']);
                Route::apiResource('candidates', RecruitmentCandidateController::class)->except(['index', 'show']);
                Route::apiResource('interviews', RecruitmentInterviewController::class)->except(['index', 'show']);
                Route::apiResource('onboarding', RecruitmentOnboardingController::class)->except(['index', 'show']);
            });
        });

        // Communication routes — Professional+ feature
        Route::middleware('license.feature:communication')->group(function () {
            Route::middleware('throttle:communication')->apiResource('announcements', AnnouncementController::class);
            Route::middleware('throttle:communication')->apiResource('notifications', NotificationController::class);
            Route::middleware('throttle:communication')->group(function () {
                Route::get('chat-messages/users', [ChatMessageController::class, 'users']);
                Route::apiResource('chat-messages', ChatMessageController::class);
            });
        });

        // Performance routes — Professional+ feature
        Route::middleware(['license.feature:performance', 'permission:performance:view|performance:manage_settings'])->group(function () {
            Route::apiResource('performance-reviews', PerformanceReviewController::class);
            Route::apiResource('performance-kpis', PerformanceKpiController::class);
            Route::apiResource('performance-goals', PerformanceGoalController::class);
            Route::apiResource('performance-appraisals', PerformanceAppraisalController::class);
            Route::get('performance/meta/employees', [PerformanceMetaController::class, 'employees']);
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

Route::prefix('v1')->group($registerRoutes);