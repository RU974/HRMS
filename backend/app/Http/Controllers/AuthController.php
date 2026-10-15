<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\User;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /**
     * Register a new user
     */
    public function register(RegisterRequest $request)
    {
        $validated = $request->validated();

        $user = DB::transaction(function () use ($validated) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
            ]);

            $employeeRole = Role::firstOrCreate(
                ['name' => User::ROLE_EMPLOYEE, 'company_id' => null],
                ['guard_name' => 'web', 'description' => 'Default employee role', 'is_system' => true]
            );

            $user->assignRole($employeeRole);

            return $user;
        });

        $token = $user->createToken('auth_token')->plainTextToken;

        $this->auditLogService->recordRequest(
            $request,
            'register',
            'auth',
            'User registered successfully',
            null,
            ['user_id' => $user->id, 'email' => $user->email],
            201
        );

        return $this->ok([
            'user' => $user->fresh(['roles.permissions', 'permissions', 'employee.department', 'employee.shift', 'employee.manager', 'company']),
            'token' => $token,
        ], 'User registered successfully', 201);
    }

    /**
     * Login user
     */
    public function login(LoginRequest $request)
    {
        $validated = $request->validated();

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            $this->auditLogService->recordRequest(
                $request,
                'login_failure',
                'auth',
                'Failed login attempt',
                null,
                ['email' => $validated['email']],
                401
            );

            return $this->fail('Invalid credentials', 401);
        }

        $user->loadMissing(['roles.permissions', 'permissions', 'employee.department', 'employee.designationRef', 'employee.shift', 'employee.manager', 'company']);
        $token = $user->createToken('auth_token')->plainTextToken;

        $this->auditLogService->recordRequest(
            $request,
            'login_success',
            'auth',
            'User logged in successfully',
            null,
            ['user_id' => $user->id, 'email' => $user->email],
            200
        );

        return $this->ok(['user' => $user->fresh(['roles.permissions', 'permissions', 'employee.department', 'employee.shift', 'employee.manager', 'company']), 'token' => $token], 'Login successful');
    }

    /**
     * Logout user
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        $this->auditLogService->recordRequest(
            $request,
            'logout',
            'auth',
            'User logged out successfully',
            null,
            ['user_id' => $request->user()?->id],
            200
        );

        return $this->ok(null, 'Logout successful');
    }

    /**
     * Get current user
     */
    public function me(Request $request)
    {
        $user = $request->user()?->loadMissing(['roles.permissions', 'permissions', 'employee.department', 'employee.designationRef', 'employee.shift', 'employee.manager', 'company']);

        // Attach a lightweight license snapshot so the frontend can render
        // expiry banners and seat warnings without a separate API call.
        $licenseSnapshot = null;
        if ($user?->company_id) {
            $license = \App\Models\License::query()
                ->where('company_id', $user->company_id)
                ->where('is_active', true)
                ->orderByRaw("CASE status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END")
                ->orderByDesc('created_at')
                ->first();

            if ($license) {
                $licenseSnapshot = [
                    'status'         => $license->status,
                    'edition'        => $license->edition,
                    'days_remaining' => $license->days_remaining,
                    'expires_at'     => $license->expires_at?->toISOString(),
                    'features'       => $license->features ?? [],
                    'max_employees'  => $license->max_employees,
                    'max_users'      => $license->max_users,
                ];
            }
        }

        return $this->ok([
            'user'    => $user,
            'license' => $licenseSnapshot,
        ]);
    }

    /**
     * Update own profile (name on user; employee fields if linked)
     */
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'name'          => 'sometimes|string|max:255',
            'phone'         => 'nullable|string|max:20',
            'address'       => 'nullable|string|max:1000',
            'date_of_birth' => 'nullable|date',
            'gender'        => 'nullable|in:male,female,other',
            'profile_image' => 'nullable|image|max:5120',
        ]);

        $userPayload = [];
        if ($request->filled('name')) {
            $userPayload['name'] = $request->input('name');
        }
        if ($request->hasFile('profile_image')) {
            $userPayload['profile_image'] = Storage::disk('public')->putFile('employee-profiles', $request->file('profile_image'));
        }
        if (!empty($userPayload)) {
            $user->update($userPayload);
        }

        $employee = $user->employee;
        if ($employee) {
            $empPayload = array_filter([
                'name'          => $request->input('name'),
                'phone'         => $request->input('phone'),
                'address'       => $request->input('address'),
                'date_of_birth' => $request->input('date_of_birth'),
                'gender'        => $request->input('gender'),
            ], fn($v) => $v !== null);

            if (isset($userPayload['profile_image'])) {
                $empPayload['profile_image'] = $userPayload['profile_image'];
            }

            if (!empty($empPayload)) {
                $employee->update($empPayload);
            }
        }

        return $this->ok(
            $user->fresh(['roles.permissions', 'permissions', 'employee.department', 'employee.designationRef', 'employee.shift', 'employee.manager']),
            'Profile updated successfully'
        );
    }

    /**
     * Refresh current access token
     */
    public function refresh(Request $request)
    {
        $user = $request->user();
        $request->user()->currentAccessToken()?->delete();
        $token = $user->createToken('auth_token')->plainTextToken;

        $this->auditLogService->recordRequest(
            $request,
            'token_refresh',
            'auth',
            'Access token refreshed',
            null,
            ['user_id' => $user->id],
            200
        );

        return $this->ok(['token' => $token], 'Token refreshed successfully');
    }

    /**
     * Send password reset link
     */
    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|string|email',
        ]);

        $status = Password::sendResetLink([
            'email' => $validated['email'],
        ]);

        if ($status !== Password::RESET_LINK_SENT) {
            $this->auditLogService->recordRequest(
                $request,
                'password_reset_link_failed',
                'auth',
                'Password reset link request failed',
                null,
                ['email' => $validated['email']],
                400
            );
            return $this->fail(__($status), 400);
        }

        $this->auditLogService->recordRequest(
            $request,
            'password_reset_link_sent',
            'auth',
            'Password reset link sent',
            null,
            ['email' => $validated['email']],
            200
        );

        return $this->ok(null, 'Password reset link sent successfully');
    }

    /**
     * Reset password using token
     */
    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'token' => 'required|string',
            'email' => 'required|string|email',
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->mixedCase()->numbers()],
        ]);

        $status = Password::reset(
            $validated,
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'must_change_password' => false,
                    'remember_token' => Str::random(60),
                ])->save();
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            $this->auditLogService->recordRequest(
                $request,
                'password_reset_failed',
                'auth',
                'Password reset failed',
                null,
                ['email' => $validated['email']],
                400
            );
            return $this->fail(__($status), 400);
        }

        $this->auditLogService->recordRequest(
            $request,
            'password_reset_success',
            'auth',
            'Password reset successful',
            null,
            ['email' => $validated['email']],
            200
        );

        return $this->ok(null, 'Password reset successfully');
    }

    /**
     * Change password for the authenticated user
     */
    public function changePassword(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => 'required|string',
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->mixedCase()->numbers()],
        ]);

        if (!Hash::check($validated['current_password'], $user->password)) {
            $this->auditLogService->recordRequest(
                $request,
                'change_password_failed',
                'auth',
                'Change password failed: current password mismatch',
                null,
                ['user_id' => $user->id],
                400
            );

            return $this->fail('Current password is incorrect', 400);
        }

        if (Hash::check($validated['password'], $user->password)) {
            return $this->fail('New password must be different from the current password', 422);
        }

        $user->forceFill([
            'password' => Hash::make($validated['password']),
            'must_change_password' => false,
        ])->save();

        $this->auditLogService->recordRequest(
            $request,
            'change_password_success',
            'auth',
            'Password changed successfully',
            null,
            ['user_id' => $user->id],
            200
        );

        return $this->ok(null, 'Password changed successfully');
    }
}
