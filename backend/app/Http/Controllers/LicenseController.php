<?php

namespace App\Http\Controllers;

use App\Models\License;
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

        $license = License::with('company:id,name')->findOrFail($id);

        return $this->ok($license);
    }

    // ─── POST /settings/licenses ──────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:create');

        $validated = $request->validate([
            'licensee_name'  => ['required', 'string', 'max:255'],
            'licensee_email' => ['required', 'email', 'max:255'],
            'edition'        => ['required', 'in:Starter,Professional,Enterprise'],
            'max_employees'  => ['nullable', 'integer', 'min:1'],
            'max_users'      => ['nullable', 'integer', 'min:1'],
            'expires_at'     => ['nullable', 'date', 'after:today'],
            'issued_by'      => ['nullable', 'string', 'max:255'],
            'support_email'  => ['nullable', 'email', 'max:255'],
            'features'       => ['nullable', 'array'],
            'features.*'     => ['string'],
            'metadata'       => ['nullable', 'array'],
            'company_id'     => ['nullable', 'string', 'exists:companies,id'],
        ]);

        $companyId = $request->user()?->company_id;

        $license = $this->service->create($validated, $companyId);

        return $this->ok($license, 'License issued successfully.', 201);
    }

    // ─── PUT /settings/licenses/{id} ─────────────────────────────────────────

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:edit');

        $license = License::findOrFail($id);

        $validated = $request->validate([
            'licensee_name'  => ['sometimes', 'required', 'string', 'max:255'],
            'licensee_email' => ['sometimes', 'required', 'email', 'max:255'],
            'edition'        => ['sometimes', 'required', 'in:Starter,Professional,Enterprise'],
            'max_employees'  => ['nullable', 'integer', 'min:1'],
            'max_users'      => ['nullable', 'integer', 'min:1'],
            'expires_at'     => ['nullable', 'date'],
            'activated_at'   => ['nullable', 'date'],
            'status'         => ['nullable', 'in:trial,active,expired,suspended'],
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

        $license = License::findOrFail($id);

        $this->service->delete($license);

        return $this->ok(message: 'License deactivated successfully.');
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

        return $this->ok($this->service->allCompanyUsage());
    }

    // ─── POST /settings/licenses/activate ────────────────────────────────────

    public function activate(Request $request): JsonResponse
    {
        $this->authorizePermission($request, 'licenses:manage_settings');

        $validated = $request->validate([
            'license_key' => ['required', 'string'],
        ]);

        try {
            $license = $this->service->activate($validated['license_key']);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException) {
            return response()->json([
                'message' => 'License key not found. Please check the key and try again.',
            ], 404);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->ok($license, 'License activated successfully.');
    }
}