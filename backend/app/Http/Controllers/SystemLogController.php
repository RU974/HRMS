<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class SystemLogController extends Controller
{
    public function index(Request $request)
    {
        // Fixed: was 'view audit logs' (freeform) — must match seeded permission keys.
        // Grants access if the user has audit_logs:view OR settings:manage_settings (admins).
        $this->authorizeAnyPermission($request, ['audit_logs:view', 'settings:manage_settings']);

        $q = AuditLog::query()->with('user')->latest();
        $this->scopeToCompany($request, $q, 'user');

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

        return $this->ok($q->paginate(25));
    }

    public function show(Request $request, int $id)
    {
        // Fixed: same permission mismatch as index
        $this->authorizeAnyPermission($request, ['audit_logs:view', 'settings:manage_settings']);
        $q = AuditLog::query()->with('user');
        $this->scopeToCompany($request, $q, 'user');

        return $this->ok($q->findOrFail($id));
    }

    public function destroy(Request $request, int $id)
    {
        // Fixed: was 'settings:manage_settings' (freeform) — use the canonical seeded key
        $this->authorizePermission($request, 'settings:manage_settings');
        abort(422, 'Audit logs are immutable and cannot be deleted.');
    }

}