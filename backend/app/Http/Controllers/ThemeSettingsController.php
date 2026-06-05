<?php

namespace App\Http\Controllers;

use App\Models\ThemeSetting;
use App\Services\ThemeSettingsService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ThemeSettingsController extends Controller
{
    public function __construct(private readonly ThemeSettingsService $service)
    {
    }

    public function index(Request $request)
    {
        return $this->ok($this->service->listVisibleThemes($request->user()));
    }

    public function current(Request $request)
    {
        return $this->ok($this->service->resolveCurrent($request->user()));
    }

    public function company(Request $request)
    {
        $this->authorizePermission($request, 'manage settings');
        return $this->ok($this->service->companyTheme($request->user()));
    }

    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $setting = ThemeSetting::findOrFail($id);
        $this->assertAccessible($request, $setting);
        return $this->ok($setting);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage settings');
        $validated = $request->validate([
            'theme' => ['required', 'string', Rule::in(['light', 'dark', 'system'])],
            'preferences' => 'nullable|array',
            'company_scope' => 'nullable|boolean',
        ]);

        if ($request->boolean('company_scope') && !$request->user()?->company_id) {
            return $this->fail('Company-scoped theme settings require a company assignment.', 422);
        }

        $setting = $request->boolean('company_scope')
            ? $this->service->saveCompanyTheme($request->user(), $validated)
            : $this->service->saveUserTheme($request->user(), $validated);

        return $this->ok($setting, 'Theme settings saved successfully', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $setting = ThemeSetting::findOrFail($id);
        $this->assertAccessible($request, $setting);

        $validated = $request->validate([
            'theme' => ['sometimes', 'required', 'string', Rule::in(['light', 'dark', 'system'])],
            'preferences' => 'nullable|array',
        ]);
        $setting->update($validated);

        return $this->ok($setting->fresh(), 'Theme settings updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage settings');
        $setting = ThemeSetting::findOrFail($id);
        $this->assertAccessible($request, $setting);
        $setting->delete();
        return $this->ok(null, 'Theme setting deleted successfully');
    }

    public function saveCurrent(Request $request)
    {
        $validated = $request->validate([
            'theme' => ['required', 'string', Rule::in(['light', 'dark', 'system'])],
            'preferences' => 'nullable|array',
        ]);

        $setting = $this->service->saveUserTheme($request->user(), $validated);

        return $this->ok($this->service->resolveCurrent($request->user()), 'Theme settings saved successfully');
    }

    public function resetCurrent(Request $request)
    {
        $this->service->resetUserTheme($request->user());

        return $this->ok($this->service->resolveCurrent($request->user()), 'Theme settings reset successfully');
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
