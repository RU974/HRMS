<?php

namespace App\Services;

use App\Models\ThemeSetting;

class ThemeSettingsService
{
    public function upsert(?string $companyId, int $userId, array $data): ThemeSetting
    {
        return ThemeSetting::updateOrCreate(
            ['company_id' => $companyId, 'user_id' => $userId],
            $data
        );
    }
}
