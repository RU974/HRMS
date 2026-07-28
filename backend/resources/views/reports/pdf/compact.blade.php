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
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #111827; color: #ffffff; padding: 4px 6px; font-size: 8.5px; text-transform: uppercase; }
    td { padding: 3px 6px; font-size: 8.5px; border-bottom: 0.5px solid #d1d5db; }
    tr:nth-child(even) td { background: #f3f4f6; }
    .footer { position: fixed; bottom: -18px; left: 0; right: 0; font-size: 7.5px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
    <div class="titlebar">
        <div class="left">{{ $title }}</div>
        <div class="right">
            @if(!empty($companyLogo))
                <img class="logo" src="{{ $companyLogo }}">
            @endif
            {{ $companyName }} &middot; {{ $generatedAt }}
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
                <tr><td colspan="{{ count($columns) }}">No data available.</td></tr>
            @endforelse
        </tbody>
    </table>

    <div class="footer">{{ $companyName }} &middot; Confidential</div>
</body>
</html>
