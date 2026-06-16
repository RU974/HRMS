<?php

namespace App\Http\Controllers;

use App\Models\PerformanceReviewTemplate;
use Illuminate\Http\Request;

class PerformanceReviewTemplateController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'performance:view|performance:manage_settings');
        $companyId = $request->user()?->company_id;

        $query = PerformanceReviewTemplate::orderBy('name');
        if ($companyId) {
            $query->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $companyId));
        }

        return $this->ok($query->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $validated = $request->validate([
            'name'       => 'required|string|max:120',
            'scale_min'  => 'required|integer|min:0|max:99',
            'scale_max'  => 'required|integer|gt:scale_min|max:100',
            'criteria'   => 'nullable|array',
            'criteria.*' => 'string|max:200',
            'is_active'  => 'boolean',
            'notes'      => 'nullable|string|max:1000',
        ]);

        $template = PerformanceReviewTemplate::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
        ]);

        return $this->ok($template, 'Review template created.', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $template = PerformanceReviewTemplate::findOrFail($id);
        $this->assertOwnsRecord($request, $template);

        $validated = $request->validate([
            'name'       => 'sometimes|string|max:120',
            'scale_min'  => 'sometimes|integer|min:0|max:99',
            'scale_max'  => 'sometimes|integer|max:100',
            'criteria'   => 'nullable|array',
            'criteria.*' => 'string|max:200',
            'is_active'  => 'boolean',
            'notes'      => 'nullable|string|max:1000',
        ]);

        $template->update($validated);
        return $this->ok($template, 'Review template updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $template = PerformanceReviewTemplate::findOrFail($id);
        $this->assertOwnsRecord($request, $template);
        $template->delete();
        return $this->ok(null, 'Review template deleted.');
    }

    private function assertOwnsRecord(Request $request, PerformanceReviewTemplate $template): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId && $template->company_id && $template->company_id !== $companyId) {
            abort(403, 'You cannot modify this review template.');
        }
    }
}
