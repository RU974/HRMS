<?php

namespace App\Http\Controllers;

use App\Models\ThemeSetting;
use App\Services\ThemeSettingsService;
use Illuminate\Http\Request;

class ThemeSettingsController extends Controller
{
    public function __construct(private readonly ThemeSettingsService $service)
    {
    }

    public function index(Request $request)
    {
        return $this->ok(
            ThemeSetting::query()
                ->where('user_id', $request->user()->id)
                ->orWhere(function ($q) use ($request) {
                    $q->whereNull('user_id')->where('company_id', $request->user()->company_id);
                })
                ->orderByDesc('updated_at')
                ->get()
        );
    }

    public function show(Request $request, int $id)
    {
        $setting = ThemeSetting::findOrFail($id);
        if ($setting->user_id !== null && $setting->user_id !== $request->user()->id) {
            abort(403, 'Unauthorized.');
        }
        return $this->ok($setting);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'theme' => 'required|string|in:light,dark,system',
            'preferences' => 'nullable|array',
            'company_scope' => 'nullable|boolean',
        ]);

        $setting = $this->service->upsert(
            $request->boolean('company_scope') ? $request->user()->company_id : null,
            $request->boolean('company_scope') ? null : $request->user()->id,
            $validated
        );

        return $this->ok($setting, 'Theme settings saved successfully', 201);
    }

    public function update(Request $request, int $id)
    {
        $setting = ThemeSetting::findOrFail($id);
        if ($setting->user_id !== null && $setting->user_id !== $request->user()->id) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'theme' => 'sometimes|required|string|in:light,dark,system',
            'preferences' => 'nullable|array',
        ]);
        $setting->update($validated);

        return $this->ok($setting->fresh(), 'Theme settings updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $setting = ThemeSetting::findOrFail($id);
        if ($setting->user_id !== null && $setting->user_id !== $request->user()->id) {
            abort(403, 'Unauthorized.');
        }
        $setting->delete();
        return $this->ok(null, 'Theme setting deleted successfully');
    }
}
