<?php

namespace App\Services;

use App\Models\ThemeSetting;
use App\Models\User;
use Illuminate\Support\Collection;

class ThemeSettingsService
{
    public function resolveCurrent(User $user): array
    {
        $companyTheme = $this->companyThemeQuery($user)->first();
        $userTheme = $this->userThemeQuery($user)->first();

        $resolvedTheme = $userTheme?->theme
            ?? $companyTheme?->theme
            ?? 'system';

        return [
            'theme' => $resolvedTheme,
            'source' => $userTheme ? 'user' : ($companyTheme ? 'company' : 'system'),
            'user_theme' => $userTheme,
            'company_theme' => $companyTheme,
            'fallback_theme' => 'system',
        ];
    }

    public function companyTheme(User $user): ?ThemeSetting
    {
        return $this->companyThemeQuery($user)->first();
    }

    public function saveUserTheme(User $user, array $data): ThemeSetting
    {
        return ThemeSetting::updateOrCreate(
            ['company_id' => null, 'user_id' => $user->id],
            $this->normalizePayload($data)
        );
    }

    public function saveCompanyTheme(User $user, array $data): ThemeSetting
    {
        if (!$user->company_id) {
            throw new \InvalidArgumentException('Company-scoped theme settings require a company assignment.');
        }

        return ThemeSetting::updateOrCreate(
            ['company_id' => $user->company_id, 'user_id' => null],
            $this->normalizePayload($data)
        );
    }

    public function resetUserTheme(User $user): bool
    {
        return (bool) ThemeSetting::query()
            ->whereNull('company_id')
            ->where('user_id', $user->id)
            ->delete();
    }

    public function listVisibleThemes(User $user): Collection
    {
        return ThemeSetting::query()
            ->where(function ($query) use ($user): void {
                $query->where('user_id', $user->id);
                if ($user->company_id) {
                    $query->orWhere(function ($companyQuery) use ($user): void {
                        $companyQuery->whereNull('user_id')->where('company_id', $user->company_id);
                    });
                }
            })
            ->orderByDesc('updated_at')
            ->get();
    }

    public function upsert(?string $companyId, ?int $userId, array $data): ThemeSetting
    {
        return ThemeSetting::updateOrCreate(
            ['company_id' => $companyId, 'user_id' => $userId],
            $this->normalizePayload($data)
        );
    }

    private function userThemeQuery(User $user)
    {
        return ThemeSetting::query()
            ->where('user_id', $user->id)
            ->whereNull('company_id');
    }

    private function companyThemeQuery(User $user)
    {
        return ThemeSetting::query()
            ->whereNull('user_id')
            ->when($user->company_id, fn ($query) => $query->where('company_id', $user->company_id));
    }

    private function normalizePayload(array $data): array
    {
        return [
            'theme' => $data['theme'] ?? 'system',
            'preferences' => $data['preferences'] ?? null,
        ];
    }
}
