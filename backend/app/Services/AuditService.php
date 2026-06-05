<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class AuditService
{
    public static function record(array $data)
    {
        $user = Auth::user();

        $payload = array_merge([
            'user_id' => $user?->id,
            'user_role' => $user?->role ?? null,
            'ip_address' => Request::ip(),
            'immutable' => true,
        ], $data);

        // store in DB
        return AuditLog::create($payload);
    }
}
