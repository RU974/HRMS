<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Services\Recruitment\RecruitmentAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class RecruitmentAnalyticsController extends Controller
{
    public function __construct(private readonly RecruitmentAnalyticsService $analytics)
    {
    }

    public function overview(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok($this->analytics->overview());
    }

    public function analytics(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $validated = $request->validate([
            'from' => 'nullable|date',
            'to' => 'nullable|date|after_or_equal:from',
            'job_opening_id' => 'nullable|integer',
        ]);

        $to = isset($validated['to']) ? Carbon::parse($validated['to']) : now();
        $from = isset($validated['from']) ? Carbon::parse($validated['from']) : $to->copy()->subDays(90);

        return $this->ok($this->analytics->analytics($from, $to, $validated['job_opening_id'] ?? null));
    }
}
