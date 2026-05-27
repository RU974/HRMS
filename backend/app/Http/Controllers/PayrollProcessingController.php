<?php

namespace App\Http\Controllers;

use App\Models\PayrollProcessing;
use App\Models\User;
use Illuminate\Http\Request;

class PayrollProcessingController extends Controller
{
    private const MANAGER_ROLES = [
        User::ROLE_SUPER_ADMIN,
        User::ROLE_COMPANY_ADMIN,
        User::ROLE_HR_MANAGER,
        User::ROLE_HR_EXECUTIVE,
        User::ROLE_PAYROLL_MANAGER,
    ];

    public function index(Request $request)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $query = PayrollProcessing::query();

        if ($request->filled('month')) {
            $query->where('month', (int) $request->query('month'));
        }
        if ($request->filled('year')) {
            $query->where('year', (int) $request->query('year'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return $this->ok($query->latest()->paginate(15));
    }

    public function store(Request $request)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020',
            'status' => 'required|in:draft,processing,completed,cancelled',
            'processed_at' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        return $this->ok(PayrollProcessing::create($validated), 'Payroll processing created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        return $this->ok(PayrollProcessing::findOrFail($id));
    }

    public function update(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $item = PayrollProcessing::findOrFail($id);
        $validated = $request->validate([
            'status' => 'sometimes|in:draft,processing,completed,cancelled',
            'processed_at' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $item->update($validated);
        return $this->ok($item, 'Payroll processing updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        PayrollProcessing::findOrFail($id)->delete();
        return $this->ok(null, 'Payroll processing deleted successfully');
    }
}

