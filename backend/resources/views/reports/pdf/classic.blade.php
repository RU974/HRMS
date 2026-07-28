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
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #f3f4f6; border-bottom: 1px solid #9ca3af; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10.5px; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer { position: fixed; bottom: -30px; left: 0; right: 0; font-size: 9px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
    <div class="header">
        @if(!empty($companyLogo))
            <img class="logo" src="{{ $companyLogo }}">
        @endif
        <h1>{{ $title }}</h1>
        <div class="meta">
            {{ $companyName }} &middot; Generated {{ $generatedAt }}
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
