<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page { margin: 26px 24px; }
    body { font-family: DejaVu Sans, sans-serif; color: #111827; font-size: 9px; }
    .titlebar { width: 100%; border-collapse: collapse; border-bottom: 1px solid #111827; margin-bottom: 10px; }
    .titlebar td { border: 0; padding: 0 0 6px 0; background: none !important; vertical-align: middle; }
    .titlebar .logo-cell { width: 52px; }
    .titlebar .logo { max-height: 42px; max-width: 48px; }
    .titlebar .company { font-size: 11px; font-weight: bold; }
    .titlebar .details { font-size: 7.5px; color: #6b7280; line-height: 1.4; }
    .titlebar .right { text-align: right; }
    .titlebar .title { font-size: 12px; font-weight: bold; }
    .titlebar .gen { font-size: 7.5px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #111827; color: #ffffff; padding: 4px 6px; font-size: 8.5px; text-transform: uppercase; }
    td { padding: 3px 6px; font-size: 8.5px; border-bottom: 0.5px solid #d1d5db; }
    tr:nth-child(even) td { background: #f3f4f6; }
    .footer { position: fixed; bottom: -18px; left: 0; right: 0; font-size: 7.5px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
    <table class="titlebar">
        <tr>
            @if(!empty($companyLogo))
                <td class="logo-cell"><img class="logo" src="{{ $companyLogo }}"></td>
            @endif
            <td>
                <div class="company">{{ $companyName }}</div>
                <div class="details">
                    @if($companyAddress){{ $companyAddress }}<br>@endif
                    @if($companyPhone)Tel: {{ $companyPhone }}@endif
                    @if($companyPhone && $companyEmail) &middot; @endif
                    @if($companyEmail){{ $companyEmail }}@endif
                    @if($companyWebsite) &middot; {{ $companyWebsite }}@endif
                </div>
            </td>
            <td class="right">
                <div class="title">{{ $title }}</div>
                <div class="gen">{{ $generatedAt }}</div>
            </td>
        </tr>
    </table>

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
                <tr><td colspan="{{ count($columns) }}">No data available.</td></tr>
            @endforelse
        </tbody>
    </table>

    <div class="footer">{{ $companyName }} &middot; Confidential</div>
</body>
</html>
