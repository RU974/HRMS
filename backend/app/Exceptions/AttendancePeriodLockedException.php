<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** An attendance record sits in a month that is closed (admin lock, or payroll already run). */
class AttendancePeriodLockedException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $this->getMessage(),
            'errors' => ['period' => [$this->getMessage()]],
        ], 423);
    }
}
