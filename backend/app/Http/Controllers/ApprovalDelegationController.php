<?php

namespace App\Http\Controllers;

use App\Models\ApprovalDelegation;
use Illuminate\Http\Request;

class ApprovalDelegationController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'approvals:approve');

        $delegations = ApprovalDelegation::query()
            ->where('delegator_user_id', $request->user()->id)
            ->with('delegate:id,name,email')
            ->latest()
            ->get();

        return $this->ok($delegations);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'approvals:approve');

        $validated = $request->validate([
            'delegate_user_id' => 'required|integer|exists:users,id',
            'starts_at' => 'required|date',
            'ends_at' => 'required|date|after:starts_at',
            'notes' => 'nullable|string|max:1024',
        ]);

        if ((int) $validated['delegate_user_id'] === $request->user()->id) {
            return $this->fail('You cannot delegate approvals to yourself.', 422);
        }

        $delegation = ApprovalDelegation::create([
            'delegator_user_id' => $request->user()->id,
            'delegate_user_id' => $validated['delegate_user_id'],
            'starts_at' => $validated['starts_at'],
            'ends_at' => $validated['ends_at'],
            'company_id' => $request->user()->company_id,
            'notes' => $validated['notes'] ?? null,
        ]);

        return $this->ok($delegation->load('delegate:id,name,email'), 'Delegation created', 201);
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:approve');

        $delegation = ApprovalDelegation::query()
            ->where('delegator_user_id', $request->user()->id)
            ->findOrFail($id);

        $delegation->delete();

        return $this->ok(null, 'Delegation removed');
    }
}
