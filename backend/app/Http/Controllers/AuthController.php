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
            'user' => $user->fresh(['roles.permissions', 'permissions']),
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

        $user->loadMissing(['roles.permissions', 'permissions']);
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

        return $this->ok(['user' => $user, 'token' => $token], 'Login successful');
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
        return $this->ok($request->user()?->loadMissing(['roles.permissions', 'permissions']));
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
}
