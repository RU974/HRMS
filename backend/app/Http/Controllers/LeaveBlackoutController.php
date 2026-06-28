<?php

namespace App\Http\Controllers;

use App\Models\LeaveBlackout;
use Illuminate\Http\Request;

class LeaveBlackoutController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'leaves:view|leaves:manage_settings');

        $query = LeaveBlackout::with('leaveType:id,name')->orderBy('start_date');
        $this->scopeToCompanyOrGlobal($request, $query);

        return $this->ok($query->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'leaves:manage_settings');
        $validated = $request->validate([
            'name'          => 'required|string|max:200',
            'start_date'    => 'required|date',
            'end_date'      => 'required|date|after_or_equal:start_date',
            'leave_type_id' => 'nullable|exists:leave_types,id',
        ]);

        $blackout = LeaveBlackout::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
        ]);

        return $this->ok($blackout->load('leaveType:id,name'), 'Blackout period created.', 201);
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'leaves:manage_settings');
        $blackout = LeaveBlackout::findOrFail($id);

        if ($blackout->company_id && $blackout->company_id !== $request->user()?->company_id) {
            abort(403, 'You cannot delete this blackout period.');
        }

        $blackout->delete();
        return $this->ok(null, 'Blackout period deleted.');
    }
}
