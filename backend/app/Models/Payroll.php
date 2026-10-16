<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class Payroll extends Model
{
    protected $fillable = [
        'employee_id',
        'month',
        'year',
        'base_salary',
        'allowances',   // ← added: was missing, causing PayrollCalculator output to be silently dropped
        'bonus',
        'commission',
        'overtime_hours',
        'overtime_pay',
        'deductions',
        'attendance_deduction',
        'unpaid_days',
        'attendance_summary',
        'tax',
        'net_salary',
        'payment_date',
        'status',
        'approved_by',
        'approved_at',
        'paid_by',
        'paid_at',
        'rejected_at',
        'rejection_reason',
    ];

    protected $casts = [
        'attendance_summary' => 'array',
        'approved_at' => 'datetime',
        'paid_at'     => 'datetime',
        'rejected_at' => 'datetime',
    ];

    // ── Lifecycle states ──────────────────────────────────────────
    public const STATUS_DRAFT     = 'draft';
    public const STATUS_REVIEWED  = 'reviewed';
    public const STATUS_APPROVED  = 'approved';
    public const STATUS_PAID      = 'paid';
    public const STATUS_PENDING   = 'pending';
    public const STATUS_PROCESSED = 'processed';
    public const STATUS_CANCELLED = 'cancelled';

    public static function lifecycleStates(): array
    {
        return [
            self::STATUS_DRAFT,
            self::STATUS_REVIEWED,
            self::STATUS_APPROVED,
            self::STATUS_PAID,
            self::STATUS_PENDING,
            self::STATUS_PROCESSED,
            self::STATUS_CANCELLED,
        ];
    }

    // ── Relationships ─────────────────────────────────────────────
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by');
    }

    // ── Helpers ───────────────────────────────────────────────────

    /**
     * Transition to a new status and persist.
     * Returns false if the target status is not a recognised lifecycle state.
     */
    public function transitionTo(string $newStatus): bool
    {
        if (! in_array($newStatus, self::lifecycleStates(), true)) {
            return false;
        }

        $this->status = $newStatus;
        return $this->save();
    }
}