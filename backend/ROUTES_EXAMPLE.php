<?php

/**
 * HRMS Authentication Routes
 * 
 * Add this to your routes/api.php file
 */

use App\Http\Controllers\AuthController;

Route::prefix('auth')->group(function () {
    // Public routes
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    // Protected routes (require authentication)
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});

/**
 * Example: Add to routes/api.php
 * 
 * use Illuminate\Http\Request;
 * use Illuminate\Support\Facades\Route;
 * use App\Http\Controllers\AuthController;
 * use App\Http\Controllers\EmployeeController;
 * use App\Http\Controllers\AttendanceController;
 * use App\Http\Controllers\PayrollController;
 * 
 * Route::prefix('auth')->group(function () {
 *     Route::post('/register', [AuthController::class, 'register']);
 *     Route::post('/login', [AuthController::class, 'login']);
 * 
 *     Route::middleware('auth:sanctum')->group(function () {
 *         Route::post('/logout', [AuthController::class, 'logout']);
 *         Route::get('/me', [AuthController::class, 'me']);
 *     });
 * });
 * 
 * // Protected routes for employees
 * Route::middleware('auth:sanctum')->group(function () {
 *     Route::apiResource('employees', EmployeeController::class);
 *     Route::get('employees/search', [EmployeeController::class, 'search']);
 *     Route::get('employees/department/{departmentId}', [EmployeeController::class, 'getByDepartment']);
 * 
 *     Route::apiResource('attendance', AttendanceController::class);
 *     Route::get('attendance/employee/{employeeId}', [AttendanceController::class, 'getByEmployee']);
 *     Route::get('attendance/monthly-stats/{employeeId}/{month}/{year}', [AttendanceController::class, 'getMonthlyStats']);
 *     Route::post('attendance/check-in', [AttendanceController::class, 'checkIn']);
 *     Route::post('attendance/check-out', [AttendanceController::class, 'checkOut']);
 * 
 *     Route::apiResource('payroll', PayrollController::class);
 *     Route::get('payroll/employee/{employeeId}', [PayrollController::class, 'getByEmployee']);
 *     Route::post('payroll/generate', [PayrollController::class, 'generatePayroll']);
 *     Route::post('payroll/{id}/mark-paid', [PayrollController::class, 'markAsPaid']);
 *     Route::get('payroll/summary/monthly', [PayrollController::class, 'getMonthlySummary']);
 * });
 */
