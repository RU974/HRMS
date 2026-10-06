<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page { margin: 40px 30px; }
    body { font-family: DejaVu Sans, sans-serif; color: #1f2937; font-size: 10px; }
    .header { border-bottom: 2px solid #1f2937; padding-bottom: 8px; margin-bottom: 14px; }
    .header h1 { font-size: 17px; margin: 0 0 3px 0; }
    .header .meta { font-size: 10px; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #f3f4f6; border-bottom: 1px solid #9ca3af; padding: 5px 6px; font-size: 9px; text-transform: uppercase; }
    td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
    .r { text-align: right; }
    tr { page-break-inside: avoid; }
    .grand td { font-weight: bold; font-size: 11px; border-top: 2px solid #1f2937; border-bottom: none; background: #f9fafb; }
    .payable { margin-top: 16px; text-align: right; font-size: 14px; font-weight: bold; }
    .sign { margin-top: 50px; width: 100%; }
    .sign td { border: none; width: 33%; text-align: center; padding-top: 4px; font-size: 10px; }
    .sign .line { border-top: 1px solid #1f2937; }
    .footer { position: fixed; bottom: -25px; left: 0; right: 0; font-size: 9px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
    <div class="header">
        <h1>Payroll Summary &mdash; {{ $period }}</h1>
        <div class="meta">{{ $companyName }} &middot; {{ count($records) }} employee(s) &middot; Generated {{ $generatedAt }}</div>
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Emp. ID</th>
                <th>Employee</th>
                <th class="r">Base Salary</th>
                <th class="r">Allowances</th>
                <th class="r">Bonus</th>
                <th class="r">Overtime</th>
                <th class="r">Deductions</th>
                <th class="r">Tax</th>
                <th class="r">Net Payable</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            @foreach($records as $i => $p)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td>{{ $p->employee?->employee_number ?? '#' . $p->employee_id }}</td>
                    <td>{{ $p->employee?->name ?? 'Employee #' . $p->employee_id }}</td>
                    <td class="r">{{ number_format((float) $p->base_salary, 2) }}</td>
                    <td class="r">{{ number_format((float) $p->allowances, 2) }}</td>
                    <td class="r">{{ number_format((float) $p->bonus, 2) }}</td>
                    <td class="r">{{ number_format((float) $p->overtime_pay, 2) }}</td>
                    <td class="r">{{ number_format((float) $p->deductions, 2) }}</td>
                    <td class="r">{{ number_format((float) $p->tax, 2) }}</td>
                    <td class="r"><strong>{{ number_format((float) $p->net_salary, 2) }}</strong></td>
                    <td>{{ ucfirst($p->status) }}</td>
                </tr>
            @endforeach
            <tr class="grand">
                <td colspan="3">GRAND TOTAL</td>
                <td class="r">{{ number_format($totals['base'], 2) }}</td>
                <td class="r">{{ number_format($totals['allowances'], 2) }}</td>
                <td class="r">{{ number_format($totals['bonus'], 2) }}</td>
                <td class="r">{{ number_format($totals['overtime'], 2) }}</td>
                <td class="r">{{ number_format($totals['deductions'], 2) }}</td>
                <td class="r">{{ number_format($totals['tax'], 2) }}</td>
                <td class="r">{{ number_format($totals['net'], 2) }}</td>
                <td></td>
            </tr>
        </tbody>
    </table>

    <div class="payable">Total Amount Payable: {{ number_format($totals['net'], 2) }}</div>

    <table class="sign">
        <tr>
            <td><div class="line">Prepared by (HR)</div></td>
            <td><div class="line">Verified by (Accounts)</div></td>
            <td><div class="line">Approved by (CEO)</div></td>
        </tr>
    </table>

    <div class="footer">{{ $companyName }} &middot; Payroll {{ $period }}</div>
</body>
</html>
