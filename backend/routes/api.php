<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DesignationController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\CandidateController;
use App\Http\Controllers\EmployeeDocumentController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HolidayController;
use App\Http\Controllers\InterviewController;
use App\Http\Controllers\JobOpeningController;
use App\Http\Controllers\LeaveController;
use App\Http\Controllers\LeaveTypeController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ShiftController;
use App\Http\Controllers\RolePermissionController;
use App\Http\Controllers\UserRoleController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\CompanySettingsController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\ThemeSettingsController;
use App\Http\Controllers\SystemLogController;
use App\Http\Controllers\AnnouncementController;

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
        Route::post('/register', [AuthController::class, 'register']);
        Route::post('/login', [AuthController::class, 'login']);
    });

    // Protected routes - require authentication
    Route::middleware(['auth:sanctum', 'audit.log'])->group(function () {
        // Authentication routes
        Route::prefix('auth')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout']);
            Route::get('/me', [AuthController::class, 'me']);
            Route::post('/refresh', [AuthController::class, 'refresh']);
        });

        // Dashboard + reports
        Route::get('dashboard/summary', [DashboardController::class, 'summary']);
        Route::get('me/permissions', [RolePermissionController::class, 'myPermissions']);
        Route::prefix('reports')->group(function () {
            Route::get('/employees', [ReportController::class, 'employees']);
            Route::get('/attendance', [ReportController::class, 'attendance']);
            Route::get('/leave', [ReportController::class, 'leave']);
            Route::get('/payroll', [ReportController::class, 'payroll']);
        });
        Route::apiResource('reports', ReportController::class);

        Route::middleware('permission:settings:manage_roles')->group(function () {
            Route::get('permissions', [RolePermissionController::class, 'permissions']);
            Route::get('roles', [RolePermissionController::class, 'roles']);
            Route::post('roles', [RolePermissionController::class, 'storeRole']);
            Route::put('roles/{id}', [RolePermissionController::class, 'updateRole']);
            Route::delete('roles/{id}', [RolePermissionController::class, 'deleteRole']);
            Route::get('users/{id}/roles', [UserRoleController::class, 'getUserRoles']);
            Route::put('users/{id}/roles', [UserRoleController::class, 'updateUserRoles']);
        });

        Route::middleware('permission:settings:general')->group(function () {
            Route::apiResource('settings/users', UserManagementController::class);
            Route::apiResource('settings/companies', CompanySettingsController::class);
            Route::apiResource('settings/branches', BranchController::class);
            Route::apiResource('settings/themes', ThemeSettingsController::class);
            Route::get('settings/system-logs', [SystemLogController::class, 'index']);
            Route::get('settings/system-logs/{id}', [SystemLogController::class, 'show']);
            Route::delete('settings/system-logs/{id}', [SystemLogController::class, 'destroy']);
            Route::delete('settings/system-logs', [SystemLogController::class, 'clear']);
        });

        // Employee routes
        Route::get('employees/search', [EmployeeController::class, 'search']);
        Route::get('employees/department/{departmentId}', [EmployeeController::class, 'getByDepartment']);
        Route::post('employees/bulk-action', [EmployeeController::class, 'bulkAction']);
        Route::get('employees/export/csv', [EmployeeController::class, 'export']);
        Route::post('employees/{id}/set-password', [EmployeeController::class, 'setUserPassword']);
        Route::apiResource('employees', EmployeeController::class);

        // Department routes
        Route::post('departments/{id}/restore', [DepartmentController::class, 'restore']);
        Route::post('departments/{id}/reassign-employees', [DepartmentController::class, 'reassignEmployees']);
        Route::delete('departments/{id}/force', [DepartmentController::class, 'forceDelete']);
        Route::apiResource('departments', DepartmentController::class);

        // Designation routes
        Route::apiResource('designations', DesignationController::class);

        // Attendance routes
        Route::get('attendance/employee/{employeeId}', [AttendanceController::class, 'getByEmployee']);
        Route::get('attendance/monthly-stats/{employeeId}/{month}/{year}', [AttendanceController::class, 'getMonthlyStats']);
        Route::get('attendance/company-monthly-summary', [AttendanceController::class, 'companyMonthlySummary']);
        Route::get('attendance/policy', [AttendanceController::class, 'getPolicy']);
        Route::put('attendance/policy', [AttendanceController::class, 'updatePolicy']);
        Route::post('attendance/check-in', [AttendanceController::class, 'checkIn']);
        Route::post('attendance/check-out', [AttendanceController::class, 'checkOut']);
        Route::apiResource('attendance', AttendanceController::class);

        // Employee document routes
        Route::get('employee-documents/{id}/preview', [EmployeeDocumentController::class, 'preview']);
        Route::get('employee-documents/{id}/download', [EmployeeDocumentController::class, 'download']);
        Route::apiResource('employee-documents', EmployeeDocumentController::class);

        // Payroll routes
        Route::get('payroll/employee/{employeeId}', [PayrollController::class, 'getByEmployee']);
        Route::get('payroll/summary/monthly', [PayrollController::class, 'getMonthlySummary']);
        Route::post('payroll/generate', [PayrollController::class, 'generatePayroll']);
        Route::post('payroll/{id}/mark-paid', [PayrollController::class, 'markAsPaid']);
        Route::apiResource('payroll', PayrollController::class);

        // Leave routes
        Route::apiResource('leaves', LeaveController::class);

        // Attendance/Leave setup routes
        Route::middleware('role:Super Admin,Company Admin,HR Manager,HR Executive,Attendance Manager')->group(function () {
            Route::apiResource('holidays', HolidayController::class);
            Route::apiResource('shifts', ShiftController::class);
            Route::apiResource('leave-types', LeaveTypeController::class);
        });

        // Recruitment routes
        Route::middleware('role:Super Admin,Company Admin,HR Manager,HR Executive,Recruiter')->group(function () {
            Route::get('recruitment/pipeline-summary', [CandidateController::class, 'pipelineSummary']);
            Route::apiResource('job-openings', JobOpeningController::class);
            Route::apiResource('candidates', CandidateController::class);
            Route::apiResource('interviews', InterviewController::class);
        });

        // Communication routes
        Route::apiResource('announcements', AnnouncementController::class);
    });
};

// Backward-compatible routes: /api/*
$registerRoutes();

// Versioned routes: /api/v1/*
Route::prefix('v1')->group($registerRoutes);
