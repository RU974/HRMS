<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class SystemLogController extends Controller
{
    private const ADMIN_ROLES = [User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN, User::ROLE_IT_SUPPORT];

    public function index(Request $request)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        $q = AuditLog::query()->with('user')->latest();
        if ($request->filled('method')) {
            $q->where('method', strtoupper((string) $request->input('method')));
        }
        if ($request->filled('path')) {
            $q->where('path', 'like', '%' . $request->input('path') . '%');
        }
        return $this->ok($q->limit((int) $request->input('limit', 200))->get());
    }

    public function show(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        return $this->ok(AuditLog::with('user')->findOrFail($id));
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        AuditLog::findOrFail($id)->delete();
        return $this->ok(null, 'System log deleted successfully');
    }

    public function clear(Request $request)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        $deleted = AuditLog::query()->delete();
        return $this->ok(['deleted' => $deleted], 'System logs cleared successfully');
    }
}
