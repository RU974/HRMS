<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    /**
     * Register a new user
     */
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role_ids' => ['sometimes', 'array', 'min:1'],
            'role_ids.*' => ['uuid', 'exists:roles,id'],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        $roleIds = $validated['role_ids'] ?? [];
        if (empty($roleIds)) {
            $employeeRoleId = Role::where('name', User::ROLE_EMPLOYEE)->whereNull('company_id')->value('id');
            if ($employeeRoleId) {
                $roleIds = [$employeeRoleId];
            }
        }
        if (!empty($roleIds)) {
            $user->rolesRelation()->sync($roleIds);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return $this->ok(['user' => $user->fresh('rolesRelation.permissions'), 'token' => $token], 'User registered successfully', 201);
    }

    /**
     * Login user
     */
    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        if (!Auth::attempt($validated)) {
            return $this->fail('Invalid credentials', 401);
        }

        $user = Auth::user()?->loadMissing('rolesRelation.permissions');
        $token = $user->createToken('auth_token')->plainTextToken;

        return $this->ok(['user' => $user, 'token' => $token], 'Login successful');
    }

    /**
     * Logout user
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return $this->ok(null, 'Logout successful');
    }

    /**
     * Get current user
     */
    public function me(Request $request)
    {
        return $this->ok($request->user()?->loadMissing('rolesRelation.permissions'));
    }

    /**
     * Refresh current access token
     */
    public function refresh(Request $request)
    {
        $user = $request->user();
        $request->user()->currentAccessToken()?->delete();
        $token = $user->createToken('auth_token')->plainTextToken;

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
            return $this->fail(__($status), 400);
        }

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
            return $this->fail(__($status), 400);
        }

        return $this->ok(null, 'Password reset successfully');
    }
}
