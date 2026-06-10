<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

/**
 * LicenseController
 *
 * Handles license key management routes registered in api.php:
 *   GET  settings/licenses/usage
 *   POST settings/licenses/activate
 *   CRUD settings/licenses  (apiResource)
 *
 * All routes are guarded by 'permission:settings:manage_settings'.
 * Extend this stub with your licensing logic (e.g. a LicenseService).
 */
class LicenseController extends Controller
{
    /**
     * GET /api/settings/licenses
     * List all stored license records.
     */
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        // TODO: replace with real LicenseService::list() call
        return $this->ok([], 'No licenses configured yet.');
    }

    /**
     * POST /api/settings/licenses
     * Store a new license record.
     */
    public function store(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $validated = $request->validate([
            'key'         => 'required|string|max:255',
            'product'     => 'nullable|string|max:255',
            'expires_at'  => 'nullable|date',
        ]);

        // TODO: persist via LicenseService
        return $this->ok($validated, 'License stored (stub).', 201);
    }

    /**
     * GET /api/settings/licenses/{id}
     */
    public function show(Request $request, string $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        // TODO: fetch from DB
        return $this->ok(['id' => $id], 'License record (stub).');
    }

    /**
     * PUT /api/settings/licenses/{id}
     */
    public function update(Request $request, string $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        // TODO: update via LicenseService
        return $this->ok(['id' => $id], 'License updated (stub).');
    }

    /**
     * DELETE /api/settings/licenses/{id}
     */
    public function destroy(Request $request, string $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        // TODO: delete via LicenseService
        return $this->ok(null, 'License deleted (stub).');
    }

    /**
     * GET /api/settings/licenses/usage
     * Return current seat / module usage statistics.
     */
    public function usage(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        // TODO: calculate real usage
        return $this->ok([
            'seats_used'  => 0,
            'seats_limit' => null,
            'modules'     => [],
            'edition'     => 'community',
            'expires_at'  => null,
        ]);
    }

    /**
     * POST /api/settings/licenses/activate
     * Activate a license key.
     */
    public function activate(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $validated = $request->validate([
            'key' => 'required|string',
        ]);

        // TODO: verify key against a licensing server or local logic
        return $this->ok(['activated' => false], 'License activation not yet implemented.');
    }
}