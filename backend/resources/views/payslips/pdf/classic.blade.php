<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page { margin: 50px 40px; }
    body { font-family: DejaVu Sans, sans-serif; color: #1f2937; font-size: 11px; }
    .header { border-bottom: 2px solid #1f2937; padding-bottom: 10px; margin-bottom: 18px; }
    .header .logo { height: 36px; margin-bottom: 8px; }
    .header h1 { font-size: 18px; margin: 0 0 4px 0; }
    .header .meta { font-size: 10px; color: #4b5563; }
    .info { display: table; width: 100%; margin-bottom: 16px; }
    .info .col { display: table-cell; width: 50%; vertical-align: top; font-size: 10.5px; }
    .info p { margin: 2px 0; }
    .info .label { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { text-align: left; background: #f3f4f6; border-bottom: 1px solid #9ca3af; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10.5px; }
    td.amount, th.amount { text-align: right; }
    .totals td { font-weight: bold; border-top: 2px solid #1f2937; border-bottom: none; }
    .net { margin-top: 14px; text-align: right; font-size: 13px; font-weight: bold; }
    .footer { position: fixed; bottom: -30px; left: 0; right: 0; font-size: 9px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
    <div class="header">
        @if(!empty($companyLogo))
            <img class="logo" src="{{ $companyLogo }}">
        @endif
        <h1>Payslip &mdash; {{ $payslip->slip_number }}</h1>
        <div class="meta">
            {{ $companyName }} @if($companyAddress) &middot; {{ $companyAddress }} @endif &middot; Generated {{ $generatedAt }}
        </div>
    </div>

    <div class="info">
        <div class="col">
            <p><span class="label">Employee:</span> {{ $employeeName }}</p>
            <p><span class="label">Employee #:</span> {{ $employeeNumber }}</p>
            <p><span class="label">Department:</span> {{ $departmentName }}</p>
            <p><span class="label">Designation:</span> {{ $designationName }}</p>
        </div>
        <div class="col">
            <p><span class="label">Pay Period:</span> {{ $period }}</p>
            <p><span class="label">Issue Date:</span> {{ $issueDate }}</p>
            <p><span class="label">Status:</span> {{ ucfirst($payslip->status) }}</p>
        </div>
    </div>

    <table>
        <thead><tr><th>Earnings</th><th class="amount">Amount</th></tr></thead>
        <tbody>
            @foreach($earnings as $label => $value)
                <tr><td>{{ $label }}</td><td class="amount">{{ number_format($value, 2) }}</td></tr>
            @endforeach
            <tr class="totals"><td>Gross Pay</td><td class="amount">{{ number_format($grossPay, 2) }}</td></tr>
        </tbody>
    </table>

    <table>
        <thead><tr><th>Deductions</th><th class="amount">Amount</th></tr></thead>
        <tbody>
            @foreach($deductions as $label => $value)
                <tr><td>{{ $label }}</td><td class="amount">{{ number_format($value, 2) }}</td></tr>
            @endforeach
            <tr class="totals"><td>Total Deductions</td><td class="amount">{{ number_format($totalDeductions, 2) }}</td></tr>
        </tbody>
    </table>

    <div class="net">Net Pay: {{ number_format($netSalary, 2) }}</div>

    <div class="footer">{{ $companyName }} &middot; Confidential</div>
</body>
</html>
