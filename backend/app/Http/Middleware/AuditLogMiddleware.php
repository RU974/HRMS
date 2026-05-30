<?php

namespace App\Http\Middleware;

use Closure;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AuditLogMiddleware
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $this->auditRequest($request, $response->getStatusCode());

        return $response;
    }

    private function auditRequest(Request $request, int $statusCode): void
    {
        $path = $request->path();

        if (str_starts_with($path, 'api/v1/auth') || str_starts_with($path, 'api/auth')) {
            return;
        }

        $module = $this->auditLogService->resolveModuleFromPath($path);
        $action = $this->auditLogService->resolveActionFromRequest($request);
        $payload = $request->except(['password', 'password_confirmation', 'token', 'current_password', 'new_password']);

        if ($request->isMethod('GET')) {
            if (!$this->isSensitiveRead($path)) {
                return;
            }

            $this->auditLogService->recordRequest(
                $request,
                'view',
                $module,
                $this->describeRequest($request, 'viewed'),
                null,
                $payload,
                $statusCode
            );

            return;
        }

        if ($request->user()) {
            $this->auditLogService->recordRequest(
                $request,
                $action,
                $module,
                $this->describeRequest($request, $action),
                null,
                $payload,
                $statusCode
            );
        }
    }

    private function isSensitiveRead(string $path): bool
    {
        return str_starts_with($path, 'api/v1/payroll')
            || str_starts_with($path, 'api/v1/employees/')
            || str_starts_with($path, 'api/v1/employee-documents/')
            || str_starts_with($path, 'api/v1/payslips')
            || str_starts_with($path, 'api/v1/reports')
            || str_starts_with($path, 'api/v1/settings/system-logs');
    }

    private function describeRequest(Request $request, string $verb): string
    {
        return sprintf('%s %s', ucfirst($verb), $request->path());
    }
}
