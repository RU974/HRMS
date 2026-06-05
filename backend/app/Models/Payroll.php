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
        'bonus',
        'deductions',
        'tax',
        'net_salary',
        'payment_date',
        'status',
    ];

    // Lifecycle states - keep backward compatible values and allow new enterprise states
    public const STATUS_DRAFT = 'draft';
    public const STATUS_REVIEWED = 'reviewed';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_PAID = 'paid';
    public const STATUS_PENDING = 'pending';
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

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function transitionTo(string $newStatus): bool
    {
        if (!in_array($newStatus, self::lifecycleStates(), true)) {
            return false;
        }

        $this->status = $newStatus;
        return $this->save();
    }
}
