<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Payslip;
use Barryvdh\DomPDF\Facade\Pdf;

class PayslipExportService
{
    public const PDF_TEMPLATES = ['classic', 'corporate', 'compact'];

    public function toPdf(Payslip $payslip, string $template = 'classic'): string
    {
        $template = strtolower(trim($template));
        if (!in_array($template, self::PDF_TEMPLATES, true)) {
            $template = 'classic';
        }

        $employee = $payslip->employee;
        $payroll = $payslip->payroll;
        $company = $employee?->company_id ? Company::find($employee->company_id) : null;

        $earnings = [
            'Basic Salary' => (float) ($payroll->base_salary ?? 0),
            'Allowances' => (float) ($payroll->allowances ?? 0),
            'Bonus' => (float) ($payroll->bonus ?? 0),
        ];
        $deductions = [
            'Deductions' => (float) ($payroll->deductions ?? 0),
            'Tax' => (float) ($payroll->tax ?? 0),
        ];

        $employeeName = $employee?->name
            ?? (trim(($employee?->first_name ?? '') . ' ' . ($employee?->last_name ?? '')) ?: '—');

        $pdf = Pdf::loadView("payslips.pdf.{$template}", [
            'payslip' => $payslip,
            'companyName' => $company->name ?? 'HRMS',
            'companyAddress' => $company->address ?? null,
            'employeeName' => $employeeName,
            'employeeNumber' => $employee?->employee_number ?? '—',
            'departmentName' => $employee?->department?->name ?? '—',
            'designationName' => $employee?->designationRef?->name ?? $employee?->designation ?? '—',
            'period' => $payroll ? sprintf('%02d/%d', $payroll->month, $payroll->year) : '—',
            'issueDate' => $payslip->issue_date ? \Illuminate\Support\Carbon::parse($payslip->issue_date)->format('M j, Y') : '—',
            'earnings' => $earnings,
            'deductions' => $deductions,
            'grossPay' => array_sum($earnings),
            'totalDeductions' => array_sum($deductions),
            'netSalary' => (float) ($payroll->net_salary ?? 0),
            'generatedAt' => now()->format('M j, Y g:i A'),
        ])->setPaper('a4', 'portrait');

        return $pdf->output();
    }
}
