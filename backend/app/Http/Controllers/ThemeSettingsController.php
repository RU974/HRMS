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
        $this->assertAccessible($request, $setting);
        return $this->ok($setting);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'theme' => 'required|string|in:light,dark,system',
            'preferences' => 'nullable|array',
            'company_scope' => 'nullable|boolean',
        ]);

        if ($request->boolean('company_scope') && !$request->user()?->company_id) {
            return $this->fail('Company-scoped theme settings require a company assignment.', 422);
        }

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
        $this->assertAccessible($request, $setting);

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
        $this->assertAccessible($request, $setting);
        $setting->delete();
        return $this->ok(null, 'Theme setting deleted successfully');
    }

    private function assertAccessible(Request $request, ThemeSetting $setting): void
    {
        $user = $request->user();

        if ($setting->user_id !== null) {
            if (!$user || $setting->user_id !== $user->id) {
                abort(403, 'Unauthorized.');
            }

            return;
        }

        if ($setting->company_id !== null) {
            if (!$user || !$user->company_id || $setting->company_id !== $user->company_id) {
                abort(403, 'Unauthorized.');
            }

            return;
        }

        abort(403, 'Unauthorized.');
    }
}
