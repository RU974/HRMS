<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\Request;

class SystemLogController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'view audit logs');

        $q = AuditLog::query()->with('user')->latest();

        if ($request->filled('method')) {
            $q->where('http_method', strtoupper((string) $request->input('method')));
        }
        if ($request->filled('module')) {
            $q->where('module', $request->input('module'));
        }
        if ($request->filled('action')) {
            $q->where('action', $request->input('action'));
        }
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $q->where(function ($query) use ($search): void {
                $query->where('description', 'like', '%' . $search . '%')
                    ->orWhere('endpoint', 'like', '%' . $search . '%');
            });
        }

        return $this->ok($q->get());
    }

    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'view audit logs');
        return $this->ok(AuditLog::with('user')->findOrFail($id));
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage settings');
        abort(422, 'Audit logs are immutable and cannot be deleted.');
    }
}
