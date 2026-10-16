<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\ShiftSwap;
use App\Services\ShiftNotificationService;
use App\Services\ShiftScheduleService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * One-day shift swaps between two employees: the requester asks, the colleague agrees, a manager / HR approves,
 * and only then does the schedule change (as overrides tied to the swap).
 *
 * Self-service: any employee can ask, answer and cancel their own. Deciding needs attendance:edit,
 * or being the requester's line manager.
 */
class ShiftSwapController extends Controller
{
    public function __construct(private ShiftScheduleService $schedule, private ShiftNotificationService $notify)
    {
    }

    public function index(Request $request)
    {
        $companyId = $this->companyId($request);
        $me = $request->user()->employee;
        $query = ShiftSwap::withoutGlobalScopes()->where('company_id', $companyId)
            ->with(['requester:id,name,department_id', 'counterpart:id,name,department_id'])->latest();

        $scope = (string) $request->input('scope', 'mine');
        if ($scope === 'mine') {
            abort_if(!$me, 404, 'Your account is not linked to an employee record.');
            $query->where(fn ($q) => $q->where('requester_id', $me->id)->orWhere('counterpart_id', $me->id));
        } else {
            // The review queue: everyone's swaps for HR, the team's swaps for a line manager.
            abort_unless($this->canReview($request), 403, 'You are not authorized to review shift swaps.');
            if (!$this->userIsCompanyAdmin($request) && !$request->user()->can('attendance:edit') && $me) {
                $query->whereHas('requester', fn ($q) => $q->where('manager_id', $me->id));
            }
            if ($scope === 'pending') {
                $query->where('status', ShiftSwap::PENDING_APPROVAL);
            }
        }
        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }

        return $this->ok($query->limit(200)->get());
    }

    /** People someone can ask to swap with: colleagues in their department (HR sees everyone). */
    public function colleagues(Request $request)
    {
        $companyId = $this->companyId($request);
        $me = $request->user()->employee;
        $admin = $request->user()->can('attendance:edit') || $this->userIsCompanyAdmin($request);
        abort_if(!$me && !$admin, 404, 'Your account is not linked to an employee record.');

        $query = Employee::withoutGlobalScopes()->where('company_id', $companyId)->where('status', 'active')->orderBy('name');
        if (!($admin && $request->boolean('all'))) {
            abort_if(!$me, 404, 'Your account is not linked to an employee record.');
            $query->where('department_id', $me->department_id);
        }
        if ($me) {
            $query->whereKeyNot($me->id);
        }

        return $this->ok($query->limit(300)->get(['id', 'name', 'department_id']));
    }

    public function store(Request $request)
    {
        $companyId = $this->companyId($request);
        $data = $request->validate([
            'counterpart_id' => 'required|integer',
            'requester_id' => 'nullable|integer',
            'requester_date' => 'required|date',
            'counterpart_date' => 'nullable|date',
            'reason' => 'nullable|string|max:255',
            'auto_approve' => 'nullable|boolean',
        ]);

        $admin = $request->user()->can('attendance:edit') || $this->userIsCompanyAdmin($request);
        $me = $request->user()->employee;
        // Employees ask for themselves; HR can arrange a swap between two people.
        $requesterId = $admin && !empty($data['requester_id']) ? (int) $data['requester_id'] : $me?->id;
        abort_if(!$requesterId, 422, 'Your account is not linked to an employee record.');

        $requester = Employee::withoutGlobalScopes()->where('company_id', $companyId)->find($requesterId);
        $counterpart = Employee::withoutGlobalScopes()->where('company_id', $companyId)->find((int) $data['counterpart_id']);
        abort_if(!$requester || !$counterpart, 403, 'Both people must belong to your company.');

        $requesterDate = Carbon::parse($data['requester_date'])->startOfDay();
        $counterpartDate = Carbon::parse($data['counterpart_date'] ?? $data['requester_date'])->startOfDay();
        $problems = $this->schedule->swapProblems($requester, $counterpart, $requesterDate, $counterpartDate);
        if ($problems) {
            return $this->fail($problems[0], 422, ['swap' => $problems]);
        }

        $auto = $admin && (bool) ($data['auto_approve'] ?? false);
        $swap = ShiftSwap::create([
            'company_id' => $companyId,
            'requester_id' => $requester->id,
            'counterpart_id' => $counterpart->id,
            'requester_date' => $requesterDate->toDateString(),
            'counterpart_date' => $counterpartDate->toDateString(),
            'reason' => $data['reason'] ?? null,
            'status' => $auto ? ShiftSwap::APPROVED : ShiftSwap::PENDING_PEER,
            'peer_responded_at' => $auto ? now() : null,
            'decided_by' => $auto ? $request->user()->id : null,
            'decided_at' => $auto ? now() : null,
        ]);

        if ($auto) {
            $this->schedule->applySwap($swap);
            $this->notify->decided($swap);

            return $this->ok($swap->load(['requester:id,name', 'counterpart:id,name']), 'Swap arranged', 201);
        }

        $this->notify->swapRequested($swap);

        return $this->ok($swap->load(['requester:id,name', 'counterpart:id,name']), 'Swap requested', 201);
    }

    /** The colleague answers the request. */
    public function respond(Request $request, $id)
    {
        $swap = $this->find($request, $id);
        $data = $request->validate(['accept' => 'required|boolean', 'notes' => 'nullable|string|max:255']);
        $me = $request->user()->employee;

        abort_unless($me && (int) $me->id === (int) $swap->counterpart_id, 403, 'Only the colleague asked to swap can answer this request.');
        if ($swap->status !== ShiftSwap::PENDING_PEER) {
            return $this->fail('This request is no longer waiting for your answer.', 422);
        }

        $accept = (bool) $data['accept'];
        if ($accept) {
            $problems = $this->schedule->swapProblems($swap->requester, $swap->counterpart, Carbon::parse($swap->requester_date), Carbon::parse($swap->counterpart_date), (int) $swap->id);
            if ($problems) {
                return $this->fail($problems[0], 422, ['swap' => $problems]);
            }
        }

        $swap->update([
            'status' => $accept ? ShiftSwap::PENDING_APPROVAL : ShiftSwap::REJECTED,
            'peer_responded_at' => now(),
            'decision_notes' => $accept ? null : ($data['notes'] ?? null),
        ]);
        $this->notify->peerAnswered($swap, $accept);

        return $this->ok($swap->fresh(['requester:id,name', 'counterpart:id,name']), $accept ? 'Swap accepted; waiting for approval' : 'Swap declined');
    }

    /** A manager / HR approves or rejects. */
    public function decide(Request $request, $id)
    {
        $swap = $this->find($request, $id);
        $data = $request->validate(['approve' => 'required|boolean', 'notes' => 'nullable|string|max:255']);
        abort_unless($this->canDecide($request, $swap), 403, 'You are not authorized to decide this swap.');

        if ($swap->status !== ShiftSwap::PENDING_APPROVAL) {
            return $this->fail('This swap is not waiting for approval.', 422);
        }

        $approve = (bool) $data['approve'];
        if ($approve) {
            $problems = $this->schedule->swapProblems($swap->requester, $swap->counterpart, Carbon::parse($swap->requester_date), Carbon::parse($swap->counterpart_date), (int) $swap->id);
            if ($problems) {
                return $this->fail($problems[0] . ' Reject this request or ask for a new one.', 422, ['swap' => $problems]);
            }
        }

        DB::transaction(function () use ($swap, $approve, $data, $request) {
            $swap->update([
                'status' => $approve ? ShiftSwap::APPROVED : ShiftSwap::REJECTED,
                'decided_by' => $request->user()->id,
                'decided_at' => now(),
                'decision_notes' => $data['notes'] ?? null,
            ]);
            if ($approve) {
                $this->schedule->applySwap($swap);
            }
        });
        $this->notify->decided($swap);

        return $this->ok($swap->fresh(['requester:id,name', 'counterpart:id,name']), $approve ? 'Swap approved' : 'Swap rejected');
    }

    /** The requester withdraws it, or a reviewer cancels one (even an approved swap, while its days are still ahead). */
    public function cancel(Request $request, $id)
    {
        $swap = $this->find($request, $id);
        $me = $request->user()->employee;
        $isRequester = $me && (int) $me->id === (int) $swap->requester_id;
        abort_unless($isRequester || $this->canDecide($request, $swap), 403, 'You are not authorized to cancel this swap.');

        if ($swap->status === ShiftSwap::APPROVED) {
            if (!$this->canDecide($request, $swap)) {
                return $this->fail('An approved swap can only be cancelled by your manager or HR.', 403);
            }
            if (Carbon::parse($swap->requester_date)->lt(today()) || Carbon::parse($swap->counterpart_date)->lt(today())) {
                return $this->fail('This swap has already taken place.', 422);
            }
            $this->schedule->releaseSwap($swap);
        } elseif (!$swap->isOpen()) {
            return $this->fail('This swap is already closed.', 422);
        }

        $swap->update(['status' => ShiftSwap::CANCELLED, 'decided_by' => $request->user()->id, 'decided_at' => now()]);
        $this->notify->cancelled($swap, $request->user()->id);

        return $this->ok($swap->fresh(['requester:id,name', 'counterpart:id,name']), 'Swap cancelled');
    }

    private function find(Request $request, $id): ShiftSwap
    {
        return ShiftSwap::withoutGlobalScopes()->where('company_id', $this->companyId($request))
            ->with(['requester', 'counterpart'])->findOrFail($id);
    }

    private function canReview(Request $request): bool
    {
        $user = $request->user();

        return $this->userIsCompanyAdmin($request) || $user->can('attendance:edit') || $user->can('attendance:approve')
            || Employee::withoutGlobalScopes()->where('manager_id', $user->employee?->id ?? 0)->exists();
    }

    /** HR / admins, or the requester's line manager - never one of the two people involved. */
    private function canDecide(Request $request, ShiftSwap $swap): bool
    {
        $user = $request->user();
        $me = $user->employee;
        if ($me && in_array((int) $me->id, [(int) $swap->requester_id, (int) $swap->counterpart_id], true) && !$this->userIsCompanyAdmin($request)) {
            return false;
        }

        return $this->userIsCompanyAdmin($request)
            || $user->can('attendance:edit')
            || ($me && (int) $swap->requester->manager_id === (int) $me->id);
    }

    private function companyId(Request $request): string
    {
        $companyId = $request->user()?->company_id;
        abort_if(!$companyId, 403, 'Your account is not associated with a company.');

        return (string) $companyId;
    }
}
