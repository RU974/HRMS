<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

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

        $columns = Schema::hasTable('audit_logs') ? Schema::getColumnListing('audit_logs') : [];

        $payload = [];

        if (in_array('user_id', $columns, true)) {
            $payload['user_id'] = $userId ?? $request?->user()?->id;
        }

        if (in_array('method', $columns, true)) {
            $payload['method'] = $request?->method();
        } elseif (in_array('http_method', $columns, true)) {
            $payload['http_method'] = $request?->method();
        }

        if (in_array('action', $columns, true)) {
            $payload['action'] = $action;
        }

        if (in_array('module', $columns, true)) {
            $payload['module'] = $module;
        }

        if (in_array('description', $columns, true)) {
            $payload['description'] = $description;
        }

        if (in_array('path', $columns, true)) {
            $payload['path'] = $request?->path();
        }

        if (in_array('company_id', $columns, true)) {
            $payload['company_id'] = $request?->user()?->company_id ?? null;
        }

        if (in_array('ip_address', $columns, true)) {
            $payload['ip_address'] = $request?->ip();
        }

        if (in_array('user_agent', $columns, true)) {
            $payload['user_agent'] = $request?->userAgent();
        }

        if (in_array('old_value', $columns, true)) {
            $payload['old_value'] = $oldValues ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null;
        } elseif (in_array('old_values', $columns, true)) {
            $payload['old_values'] = $oldValues ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null;
        }

        if (in_array('new_value', $columns, true)) {
            $payload['new_value'] = $newValues ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null;
        } elseif (in_array('new_values', $columns, true)) {
            $payload['new_values'] = $newValues ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null;
        }

        if (in_array('payload', $columns, true)) {
            $payload['payload'] = json_encode([
                'old' => $oldValues,
                'new' => $newValues,
                'description' => $description,
            ], JSON_UNESCAPED_UNICODE);
        }

        if (in_array('status_code', $columns, true)) {
            $payload['status_code'] = $statusCode;
        }

        try {
            return AuditLog::create($payload);
        } catch (\Throwable $exception) {
            report($exception);
            return new AuditLog();
        }
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
