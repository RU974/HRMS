<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Offer of employment - {{ $candidate->full_name }}</title>
<style>
    @page { margin: 48px 56px; }
    body { font-family: DejaVu Sans, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.6; }
    h1 { font-size: 20px; margin: 0 0 4px; color: #111827; }
    .muted { color: #6b7280; }
    .header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 24px; }
    table.terms { width: 100%; border-collapse: collapse; margin: 16px 0; }
    table.terms td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    table.terms td:first-child { width: 32%; color: #6b7280; }
    ul { margin: 4px 0 0 18px; padding: 0; }
    .signature { margin-top: 56px; }
    .signature div { display: inline-block; width: 45%; vertical-align: top; }
    .line { border-top: 1px solid #111827; margin-top: 40px; padding-top: 4px; }
</style>
</head>
<body>
<div class="header">
    <h1>{{ $company?->name ?? 'Offer of Employment' }}</h1>
    <div class="muted">Offer of employment &middot; {{ $offer->created_at?->format('d M Y') }}</div>
</div>

<p>Dear {{ $candidate->full_name }},</p>

<p>
    We are pleased to offer you the position of <strong>{{ $job?->title ?? 'the advertised role' }}</strong>@if($department)
    in the <strong>{{ $department }}</strong> department @endif
    on the terms set out below.
</p>

<table class="terms">
    <tr><td>Position</td><td>{{ $job?->title ?? '-' }}</td></tr>
    <tr><td>Employment type</td><td>{{ ucwords(str_replace('_', ' ', $job?->employment_type ?? 'full_time')) }}</td></tr>
    <tr><td>Compensation</td><td>{{ $offer->currency }} {{ number_format((float) $offer->salary, 2) }}</td></tr>
    <tr><td>Start date</td><td>{{ $offer->start_date?->format('d M Y') ?? 'To be confirmed' }}</td></tr>
    @if($offer->expires_at)
        <tr><td>Offer valid until</td><td>{{ $offer->expires_at->format('d M Y') }}</td></tr>
    @endif
    @if(!empty($offer->benefits))
        <tr>
            <td>Benefits</td>
            <td><ul>@foreach($offer->benefits as $benefit)<li>{{ $benefit }}</li>@endforeach</ul></td>
        </tr>
    @endif
</table>

@if($offer->terms)
    <p><strong>Terms and conditions</strong></p>
    <p>{!! nl2br(e($offer->terms)) !!}</p>
@endif

@if($offer->additional_notes)
    <p>{!! nl2br(e($offer->additional_notes)) !!}</p>
@endif

<p>Please confirm your acceptance by signing below and returning this letter by the date above. We look forward to welcoming you to the team.</p>

@if(!empty($offer->signature_record))
    <div class="signature">
        <div>
            <div class="line">For {{ $company?->name ?? 'the company' }}</div>
        </div>
        <div style="margin-left: 8%;">
            <div style="font-style: italic; font-size: 16px;">{{ $offer->signature_record['name'] }}</div>
            <div class="line">Signed electronically on {{ \Illuminate\Support\Carbon::parse($offer->signature_record['signed_at'])->format('d M Y H:i P') }}</div>
        </div>
    </div>
    <p style="font-size: 9px; color: #555;">
        Electronic signature record &mdash; verified by email code &middot; IP {{ $offer->signature_record['ip'] ?? 'n/a' }}
        &middot; document fingerprint {{ $offer->signature_record['document_hash'] }}
    </p>
@else
<div class="signature">
    <div>
        <div class="line">For {{ $company?->name ?? 'the company' }}</div>
    </div>
    <div style="margin-left: 8%;">
        <div class="line">{{ $candidate->full_name }} &mdash; date &amp; signature</div>
    </div>
</div>
@endif
</body>
</html>
