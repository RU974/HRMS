<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page { margin: 50px 40px; }
    body { font-family: DejaVu Sans, sans-serif; color: #1f2937; font-size: 11px; }
    .header { border-bottom: 2px solid #1f2937; padding-bottom: 10px; margin-bottom: 18px; }
    .brand { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .brand td { border: 0; padding: 0; background: none !important; vertical-align: middle; }
    .brand .logo-cell { width: 95px; }
    .brand .logo { max-height: 70px; max-width: 90px; }
    .brand .name { font-size: 16px; font-weight: bold; margin-bottom: 3px; }
    .brand .details { font-size: 9.5px; color: #4b5563; line-height: 1.5; }
    .header h1 { font-size: 18px; margin: 0 0 4px 0; }
    .header .meta { font-size: 10px; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #f3f4f6; border-bottom: 1px solid #9ca3af; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10.5px; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer { position: fixed; bottom: -30px; left: 0; right: 0; font-size: 9px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
    <div class="header">
        <table class="brand">
            <tr>
                @if(!empty($companyLogo))
                    <td class="logo-cell"><img class="logo" src="{{ $companyLogo }}"></td>
                @endif
                <td>
                    <div class="name">{{ $companyName }}</div>
                    <div class="details">
                        @if($companyAddress){{ $companyAddress }}<br>@endif
                        @if($companyPhone)Tel: {{ $companyPhone }}@endif
                        @if($companyPhone && $companyEmail) &middot; @endif
                        @if($companyEmail){{ $companyEmail }}@endif
                        @if($companyWebsite)<br>{{ $companyWebsite }}@endif
                    </div>
                </td>
            </tr>
        </table>
        <h1>{{ $title }}</h1>
        <div class="meta">
            Generated {{ $generatedAt }}
            @if($generatedBy) &middot; by {{ $generatedBy }} @endif
        </div>
    </div>

    <table>
        <thead>
            <tr>
                @foreach($columns as $column)
                    <th>{{ $column }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @forelse($rows as $row)
                <tr>
                    @foreach($row as $value)
                        <td>{{ $value }}</td>
                    @endforeach
                </tr>
            @empty
                <tr><td colspan="{{ count($columns) }}">No data available for this report.</td></tr>
            @endforelse
        </tbody>
    </table>

    <div class="footer">{{ $companyName }} &middot; Confidential</div>
</body>
</html>
