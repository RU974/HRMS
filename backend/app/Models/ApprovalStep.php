<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class ApprovalStep extends Model
{
    use HasFactory;

    protected $fillable = [
        'workflow_id',
        'step_order',
        'approver_type',
        'approver_identifier',
        'conditions',
        'required_approvals',
        'approval_mode',
        'escalation_hours',
    ];

    protected $casts = ['conditions' => 'array'];

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }

    public function approvers(): HasMany
    {
        return $this->hasMany(ApprovalStepApprover::class);
    }

    public function responses(): HasMany
    {
        return $this->hasMany(ApprovalResponse::class);
    }

    /**
     * Resolve the set of user IDs eligible to act on this step, including any
     * active delegates standing in for a matched approver.
     *
     * @return Collection<int, int>
     */
    public function approverUserIds(?int $requestedBy = null, ?int $companyId = null): Collection
    {
        $rows = $this->approvers->isNotEmpty()
            ? $this->approvers
            : collect([(object) ['approver_type' => $this->approver_type, 'approver_identifier' => $this->approver_identifier]]);

        $userIds = collect();

        foreach ($rows as $row) {
            $userIds = $userIds->merge($this->resolveApprover($row->approver_type, $row->approver_identifier, $requestedBy, $companyId));
        }

        $userIds = $userIds->filter()->unique();

        $delegated = ApprovalDelegation::query()
            ->whereIn('delegator_user_id', $userIds->all())
            ->where('starts_at', '<=', now())
            ->where('ends_at', '>=', now())
            ->pluck('delegate_user_id');

        return $userIds->merge($delegated)->filter()->unique()->values();
    }

    /**
     * @return Collection<int, int>
     */
    private function resolveApprover(string $type, ?string $identifier, ?int $requestedBy, ?int $companyId): Collection
    {
        if ($identifier === null) {
            return collect();
        }

        if ($type === 'user') {
            return collect([(int) $identifier]);
        }

        if ($type === 'role') {
            return User::query()
                ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
                ->whereHas('roles', fn ($q) => $q->where('name', $identifier))
                ->pluck('id');
        }

        if ($type === 'dynamic' && $identifier === 'manager' && $requestedBy) {
            $employee = Employee::query()->where('user_id', $requestedBy)->first();
            $managerUserId = $employee?->manager?->user_id;

            return $managerUserId ? collect([$managerUserId]) : collect();
        }

        return collect();
    }
}
