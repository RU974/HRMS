<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page { margin: 26px 24px; }
    body { font-family: DejaVu Sans, sans-serif; color: #111827; font-size: 9px; }
    .titlebar { display: table; width: 100%; border-bottom: 1px solid #111827; padding-bottom: 5px; margin-bottom: 10px; }
    .titlebar .left { display: table-cell; font-size: 13px; font-weight: bold; }
    .titlebar .right { display: table-cell; text-align: right; font-size: 8px; color: #6b7280; vertical-align: bottom; }
    .titlebar .logo { height: 18px; vertical-align: middle; margin-right: 6px; }
    .info { margin-bottom: 8px; font-size: 8.5px; color: #374151; }
    .info span { margin-right: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #111827; color: #ffffff; padding: 4px 6px; font-size: 8.5px; text-transform: uppercase; }
    td { padding: 3px 6px; font-size: 8.5px; border-bottom: 0.5px solid #d1d5db; }
    td.amount, th.amount { text-align: right; }
    tr.totals td { font-weight: bold; background: #f3f4f6; }
    .net { margin-top: 10px; text-align: right; font-size: 11px; font-weight: bold; }
    .footer { position: fixed; bottom: -18px; left: 0; right: 0; font-size: 7.5px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
    <div class="titlebar">
        <div class="left">Payslip &mdash; {{ $payslip->slip_number }}</div>
        <div class="right">
            @if(!empty($companyLogo))
                <img class="logo" src="{{ $companyLogo }}">
            @endif
            {{ $companyName }} &middot; {{ $generatedAt }}
        </div>
    </div>

    <div class="info">
        <span><strong>{{ $employeeName }}</strong></span>
        <span>{{ $employeeNumber }}</span>
        <span>{{ $departmentName }}</span>
        <span>Period {{ $period }}</span>
    </div>

    <table>
        <thead><tr><th>Earnings</th><th class="amount">Amount</th><th>Deductions</th><th class="amount">Amount</th></tr></thead>
        <tbody>
            @php
                $earningLabels = array_keys($earnings);
                $earningValues = array_values($earnings);
                $deductionLabels = array_keys($deductions);
                $deductionValues = array_values($deductions);
                $rowCount = max(count($earningValues), count($deductionValues));
            @endphp
            @for($i = 0; $i < $rowCount; $i++)
                <tr>
                    <td>{{ $earningLabels[$i] ?? '' }}</td>
                    <td class="amount">{{ isset($earningValues[$i]) ? number_format($earningValues[$i], 2) : '' }}</td>
                    <td>{{ $deductionLabels[$i] ?? '' }}</td>
                    <td class="amount">{{ isset($deductionValues[$i]) ? number_format($deductionValues[$i], 2) : '' }}</td>
                </tr>
            @endfor
            <tr class="totals">
                <td>Gross Pay</td>
                <td class="amount">{{ number_format($grossPay, 2) }}</td>
                <td>Total Deductions</td>
                <td class="amount">{{ number_format($totalDeductions, 2) }}</td>
            </tr>
        </tbody>
    </table>

    <div class="net">Net Pay: {{ number_format($netSalary, 2) }}</div>

    <div class="footer">{{ $companyName }} &middot; Confidential</div>
</body>
</html>
