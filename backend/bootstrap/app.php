<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Access\AuthorizationException;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => \App\Http\Middleware\RoleMiddleware::class,
            'audit.log' => \App\Http\Middleware\AuditLogMiddleware::class,
            'permission' => \App\Http\Middleware\PermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                app(AuditLogService::class)->recordRequest(
                    $request,
                    'unauthenticated',
                    'security',
                    'Unauthenticated request blocked',
                    null,
                    ['message' => $e->getMessage()],
                    401
                );

                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                    'errors' => null,
                ], 401);
            }

            return null;
        });

        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if ($request->is('api/*')) {
                app(AuditLogService::class)->recordRequest(
                    $request,
                    'permission_denied',
                    'security',
                    'Authorization failure',
                    null,
                    ['message' => $e->getMessage()],
                    403
                );

                return response()->json([
                    'success' => false,
                    'message' => 'You are not authorized to perform this action.',
                    'errors' => null,
                ], 403);
            }

            return null;
        });
    })->create();
