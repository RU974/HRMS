<?php

namespace App\Http\Controllers;

use App\Models\License;
use App\Models\User;
use App\Services\LicenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LicenseController extends Controller
{
    public function __construct(private readonly LicenseService $service) {}

    // ─── GET /settings/licenses ───────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:view');

        $companyId = $request->user()?->company_id;

        return $this->ok($this->service->list($companyId));
    }

    // ─── GET /settings/licenses/{id} ─────────────────────────────────────────

    public function show(Request $request, string $id): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:view');

        $license = $this->resolveLicense($request, $id, ['company:id,name']);

        return $this->ok($license);
    }

    // ─── POST /settings/licenses ──────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        // Issuing a license is a Super Admin-only action.
        // Company Admins manage their own license via activate(); they must not
        // be able to create licenses for arbitrary companies.
        $this->authorizeRoles($request, [User::ROLE_SUPER_ADMIN]);

        $validated = $request->validate([
            'licensee_name'  => ['required', 'string', 'max:255'],
            'licensee_email' => ['required', 'email', 'max:255'],
            'edition'        => ['required', 'in:Starter,Professional,Enterprise'],
            'max_employees'  => ['nullable', 'integer', 'min:1', 'max:100000'],
            'max_users'      => ['nullable', 'integer', 'min:1', 'max:10000'],
            'expires_at'     => ['nullable', 'date', 'after:today'],
            'issued_by'      => ['nullable', 'string', 'max:255'],
            'support_email'  => ['nullable', 'email', 'max:255'],
            'features'       => ['nullable', 'array'],
            'features.*'     => ['string'],
            'metadata'       => ['nullable', 'array'],
            'company_id'     => ['nullable', 'string', 'exists:companies,id'],
        ]);

        $companyId = $request->user()?->company_id;

        try {
            $license = $this->service->create($validated, $companyId);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->ok($license, 'License issued successfully.', 201);
    }

    // ─── PUT /settings/licenses/{id} ─────────────────────────────────────────

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:edit');

        $license = $this->resolveLicense($request, $id);

        $validated = $request->validate([
            'licensee_name'  => ['sometimes', 'required', 'string', 'max:255'],
            'licensee_email' => ['sometimes', 'required', 'email', 'max:255'],
            'edition'        => ['sometimes', 'required', 'in:Starter,Professional,Enterprise'],
            'max_employees'  => ['nullable', 'integer', 'min:1', 'max:100000'],
            'max_users'      => ['nullable', 'integer', 'min:1', 'max:10000'],
            'expires_at'     => ['nullable', 'date'],
            'activated_at'   => ['nullable', 'date'],
            'issued_by'      => ['nullable', 'string', 'max:255'],
            'support_email'  => ['nullable', 'email', 'max:255'],
            'features'       => ['nullable', 'array'],
            'features.*'     => ['string'],
            'metadata'       => ['nullable', 'array'],
        ]);

        $updated = $this->service->update($license, $validated);

        return $this->ok($updated, 'License updated successfully.');
    }

    // ─── DELETE /settings/licenses/{id} ──────────────────────────────────────

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:delete');

        $license = $this->resolveLicense($request, $id);

        $this->service->delete($license);

        return $this->ok(message: 'License deactivated successfully.');
    }

    // ─── POST /settings/licenses/{id}/suspend ────────────────────────────────

    public function suspend(Request $request, string $id): JsonResponse
    {
        $this->authorizeRoles($request, [User::ROLE_SUPER_ADMIN]);

        $license = $this->resolveLicense($request, $id);

        return $this->ok($this->service->suspend($license), 'License suspended.');
    }

    // ─── POST /settings/licenses/{id}/unsuspend ──────────────────────────────

    public function unsuspend(Request $request, string $id): JsonResponse
    {
        $this->authorizeRoles($request, [User::ROLE_SUPER_ADMIN]);

        $license = $this->resolveLicense($request, $id);

        return $this->ok($this->service->unsuspend($license), 'License unsuspended.');
    }

    // ─── GET /settings/licenses/usage ────────────────────────────────────────

    public function usage(Request $request): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:view');

        $companyId = $request->user()?->company_id;

        return $this->ok($this->service->usage($companyId));
    }

    // ─── GET /settings/licenses/all-usage  (Super Admin only) ────────────────

    /**
     * Returns a usage snapshot for every company — used by the Super Admin
     * licensing dashboard to track which clients have active, expiring, or
     * missing licenses.
     *
     * Response shape:
     *   {
     *     summary: { total_companies, licensed, trial, expiring_soon, expired, no_license },
     *     companies: [
     *       { company_id, company_name, total_employees, total_users, license }
     *     ]
     *   }
     */
    public function allCompanyUsage(Request $request): JsonResponse
    {
        // Only Super Admins (company_id = null, role = Super Admin) should
        // reach this endpoint. The permission check below handles non-SA users.
        $this->authorizePermission($request, 'licenses:view');

        // Extra guard: non-Super-Admin users have a company_id.
        // They should never see other companies' data.
        if ($request->user()?->company_id) {
            return response()->json([
                'message' => 'Access restricted to Super Admin.',
            ], 403);
        }

        $page    = max(1, (int) $request->input('page', 1));
        $perPage = min(100, max(5, (int) $request->input('per_page', 25)));
        $search  = trim($request->input('search', ''));

        return $this->ok($this->service->allCompanyUsage($page, $perPage, $search));
    }

    // ─── GET /company/usage  (any authenticated user) ────────────────────────

    /**
     * Lightweight seat-meter endpoint consumed by the frontend cap widget.
     * Intentionally requires no special permission — every authenticated user
     * in a company needs to know whether new employees can be added.
     * Super admins (company_id = null) receive nulls; they use /settings/licenses/all-usage.
     */
    public function selfUsage(Request $request): JsonResponse
    {
        $companyId = $request->user()?->company_id;
        $usage     = $this->service->usage($companyId);
        $license   = $usage['license'];

        $limit   = $license?->max_employees;
        $current = $usage['active_employees'];

        return $this->ok([
            'plan_tier'        => $license?->edition,
            'employee_limit'   => $limit,
            'active_employees' => $current,
            'remaining'        => $limit === null ? null : max(0, $limit - $current),
        ]);
    }

    // ─── POST /settings/licenses/{id}/renew ──────────────────────────────────

    public function renew(Request $request, string $id): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:manage_settings');

        $license = $this->resolveLicense($request, $id);

        try {
            $renewed = $this->service->renew($license);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->ok($renewed, 'License renewed successfully.');
    }

    // ─── POST /settings/licenses/activate ────────────────────────────────────

    public function activate(Request $request): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:manage_settings');

        $validated = $request->validate([
            'license_key' => ['required', 'string', 'regex:/^HRMS-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/i'],
        ]);

        try {
            $license = $this->service->activate($validated['license_key'], $request->user()?->company_id);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException) {
            return response()->json([
                'message' => 'License key not found. Please check the key and try again.',
            ], 404);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->ok($license, 'License activated successfully.');
    }

    // ─── GET /settings/licenses/editions ─────────────────────────────────────

    /**
     * Returns the canonical edition list (seat limits + feature sets) from config.
     * Consumed by the frontend IssueModal so edition defaults stay in sync with
     * the backend without hardcoding them in two places.
     */
    public function editions(): JsonResponse
    {
        return $this->ok(config('licenses.editions', []));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Resolve a license by ID, scoped to the caller's company.
     *
     * Super Admin (company_id = null) may resolve any license.
     * Company-scoped callers may only resolve their own company's licenses;
     * a foreign or non-existent ID returns 404 — not 403 — so existence
     * is never leaked across tenant boundaries.
     *
     * @param  string[]  $with  Eager-load relations (e.g. ['company:id,name'])
     */
    private function resolveLicense(Request $request, string $id, array $with = []): License
    {
        $companyId = $request->user()?->company_id;

        $query = License::query();

        if ($with) {
            $query->with($with);
        }

        // Company-scoped callers are restricted to their own company's licenses.
        // findOrFail will produce a 404 for both missing and cross-tenant IDs.
        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        return $query->findOrFail($id);
    }
}
