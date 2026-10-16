<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesRosterView;
use App\Models\ShiftAssignment;
use App\Models\ShiftRotation;
use App\Services\ShiftScheduleService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Rotations: a repeating pattern of days (a shift, or a day off) that employees follow from an anchor date,
 * e.g. 2 days / 2 nights / 3 off, or one week of mornings then one week of evenings.
 */
class ShiftRotationController extends Controller
{
    use AuthorizesRosterView;

    private const MAX_SLOTS = 84;

    public function index(Request $request)
    {
        $this->authorizeRosterView($request);

        return $this->ok($this->query($request)->orderBy('name')->get()->map(fn (ShiftRotation $r) => $this->present($r)));
    }

    public function show(Request $request, $id)
    {
        $this->authorizeRosterView($request);

        return $this->ok($this->present($this->query($request)->findOrFail($id)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $companyId = $this->companyId($request);
        $data = $this->validated($request, $companyId, null);

        $rotation = DB::transaction(function () use ($companyId, $data) {
            $rotation = ShiftRotation::create(['company_id' => $companyId, 'name' => $data['name'], 'is_active' => $data['is_active'] ?? true]);
            $this->writeSlots($rotation, $data['slots']);

            return $rotation;
        });

        return $this->ok($this->present($rotation->load('slots')), 'Rotation created', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $rotation = $this->query($request)->findOrFail($id);
        $data = $this->validated($request, $this->companyId($request), $rotation);

        DB::transaction(function () use ($rotation, $data) {
            $rotation->update(array_intersect_key($data, array_flip(['name', 'is_active'])));
            if (isset($data['slots'])) {
                $this->writeSlots($rotation, $data['slots']);
            }
        });

        // The pattern changed under everyone who follows it: their schedule from today on moves with it.
        $refreshed = app(ShiftScheduleService::class)->rotationChanged($rotation->refresh());

        return $this->ok($this->present($rotation->load('slots')) + ['refreshed' => $refreshed], 'Rotation updated');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'attendance:edit');
        $rotation = $this->query($request)->findOrFail($id);

        $inUse = ShiftAssignment::withoutGlobalScopes()->where('shift_rotation_id', $rotation->id)->distinct()->count('employee_id');
        if ($inUse > 0) {
            return $this->fail("{$inUse} employee(s) still follow this rotation. End or change their roster first, or mark it inactive.", 422);
        }

        $rotation->delete();

        return $this->ok(null, 'Rotation deleted');
    }

    private function query(Request $request)
    {
        return ShiftRotation::withoutGlobalScopes()->where('company_id', $this->companyId($request))->with('slots');
    }

    private function present(ShiftRotation $rotation): array
    {
        return [
            'id' => $rotation->id,
            'name' => $rotation->name,
            'is_active' => $rotation->is_active,
            'cycle_days' => $rotation->slots->count(),
            'slots' => $rotation->slots->map(fn ($s) => ['position' => $s->position, 'shift_id' => $s->shift_id])->values(),
            'employee_count' => ShiftAssignment::withoutGlobalScopes()->where('shift_rotation_id', $rotation->id)->distinct()->count('employee_id'),
        ];
    }

    private function validated(Request $request, string $companyId, ?ShiftRotation $current): array
    {
        $creating = $current === null;
        $data = $request->validate([
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:120', Rule::unique('shift_rotations', 'name')->where('company_id', $companyId)->ignore($current?->id)],
            'is_active' => 'nullable|boolean',
            'slots' => [$creating ? 'required' : 'sometimes', 'array', 'min:1', 'max:' . self::MAX_SLOTS],
            'slots.*' => 'array',
            'slots.*.shift_id' => ['nullable', 'integer', Rule::exists('shifts', 'id')->where('company_id', $companyId)],
        ]);

        if (isset($data['slots']) && collect($data['slots'])->every(fn ($s) => empty($s['shift_id']))) {
            abort(response()->json(['success' => false, 'message' => 'A rotation needs at least one working day.', 'errors' => ['slots' => ['A rotation needs at least one working day.']]], 422));
        }

        return $data;
    }

    private function writeSlots(ShiftRotation $rotation, array $slots): void
    {
        $rotation->slots()->delete();
        foreach (array_values($slots) as $position => $slot) {
            $rotation->slots()->create(['position' => $position, 'shift_id' => $slot['shift_id'] ?: null]);
        }
    }

    private function companyId(Request $request): string
    {
        $companyId = $request->user()?->company_id;
        abort_if(!$companyId, 403, 'Your account is not associated with a company.');

        return (string) $companyId;
    }
}
