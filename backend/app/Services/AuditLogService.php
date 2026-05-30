<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogService
{
    public function record(
        ?Request $request,
        string $action,
        string $module,
        string $description,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?int $userId = null,
        ?int $statusCode = null
    ): AuditLog {
        $request ??= request();

        return AuditLog::create([
            'user_id' => $userId ?? $request?->user()?->id,
            'method' => $request?->method(),
            'path' => $request?->path(),
            'payload' => json_encode($newValues ?? $oldValues ?? [], JSON_UNESCAPED_UNICODE),
            'action' => $action,
            'module' => $module,
            'description' => $description,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'ip_address' => $request?->ip(),
            'user_agent' => substr((string) $request?->userAgent(), 0, 1000),
            'endpoint' => $request?->path(),
            'http_method' => $request?->method(),
            'status_code' => $statusCode,
        ]);
    }

    public function recordRequest(Request $request, string $action, string $module, string $description, ?array $oldValues = null, ?array $newValues = null, ?int $statusCode = null): AuditLog
    {
        return $this->record($request, $action, $module, $description, $oldValues, $newValues, $request->user()?->id, $statusCode);
    }

    public function resolveModuleFromPath(string $path): string
    {
        $segments = array_values(array_filter(explode('/', trim($path, '/'))));

        if (($segments[0] ?? null) === 'api' && ($segments[1] ?? null) === 'v1') {
            return $segments[2] ?? 'system';
        }

        return $segments[0] ?? 'system';
    }

    public function resolveActionFromRequest(Request $request): string
    {
        if ($request->isMethod('GET')) {
            return 'view';
        }

        return strtolower($request->method());
    }
}
