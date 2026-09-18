<?php

namespace App\Services;

use App\Models\NotificationItem;
use App\Models\Payroll;
use App\Models\Payslip;

/**
 * Payroll had no employee-facing notifications at all — a payslip could be
 * issued or a payroll marked paid and the employee would only find out by
 * checking the portal themselves. This mirrors the existing
 * LeaveNotificationService pattern (writes NotificationItem rows).
 */
class PayrollNotificationService
{
    public function notifyPaid(Payroll $payroll): void
    {
        $payroll->loadMissing('employee.user');
        $employee = $payroll->employee;
        $userId = $employee?->user_id;
        if (!$userId) {
            return;
        }

        $period = sprintf('%02d/%d', $payroll->month, $payroll->year);

        $this->create(
            userId: $userId,
            companyId: $employee?->company_id,
            type: 'payroll_paid',
            title: 'Salary paid for ' . $period,
            message: "Your salary for {$period} (net " . number_format((float) $payroll->net_salary, 2) . ") has been paid.",
        );
    }

    public function notifyPayslipIssued(Payslip $payslip): void
    {
        $payslip->loadMissing('employee.user', 'payroll');
        $employee = $payslip->employee;
        $userId = $employee?->user_id;
        if (!$userId) {
            return;
        }

        $payroll = $payslip->payroll;
        $period = $payroll ? sprintf('%02d/%d', $payroll->month, $payroll->year) : '';

        $this->create(
            userId: $userId,
            companyId: $employee?->company_id,
            type: 'payslip_issued',
            title: 'Payslip available' . ($period ? " for {$period}" : ''),
            message: "Your payslip {$payslip->slip_number} is now available to download.",
        );
    }

    private function create(int $userId, ?string $companyId, string $type, string $title, string $message): void
    {
        NotificationItem::create([
            'user_id' => $userId,
            'company_id' => $companyId,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'is_read' => false,
        ]);
    }
}
