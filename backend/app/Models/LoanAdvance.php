<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoanAdvance extends Model
{
    public const STATUS_PENDING             = 'pending';
    public const STATUS_APPROVED            = 'approved';
    public const STATUS_ACTIVE              = 'active';
    public const STATUS_DEDUCT_FROM_SALARY  = 'deduct_from_salary';
    public const STATUS_ON_HOLD             = 'on_hold';
    public const STATUS_PAID                = 'paid';
    public const STATUS_CLOSED              = 'closed';
    public const STATUS_COMPLETED           = 'completed';
    public const STATUS_CANCELLED           = 'cancelled';

    public const STATUSES = [
        self::STATUS_PENDING, self::STATUS_APPROVED, self::STATUS_ACTIVE, self::STATUS_DEDUCT_FROM_SALARY, self::STATUS_ON_HOLD,
        self::STATUS_PAID, self::STATUS_CLOSED, self::STATUS_COMPLETED, self::STATUS_CANCELLED,
    ];

    protected $fillable = [
        'employee_id',
        'company_id',
        'type',
        'title',
        'amount',
        'outstanding_balance',
        'emi_amount',
        'start_date',
        'end_date',
        'status',
        'notes',
    ];

    protected $casts = [
        'amount'              => 'float',
        'outstanding_balance' => 'float',
        'emi_amount'          => 'float',
        'start_date'          => 'date',
        'end_date'            => 'date',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /**
     * Restrict a query to records payroll should recover automatically:
     * anything flagged deduct_from_salary, plus advances already paid out.
     */
    public function scopeRecoverableFromSalary($query)
    {
        return $query->where(function ($q) {
            $q->where('status', self::STATUS_DEDUCT_FROM_SALARY)
              ->orWhere(fn ($a) => $a->where('type', 'advance')->where('status', self::STATUS_PAID));
        });
    }

    /**
     * Called when a payroll is marked paid: apply the salary-deduction rows that
     * fed that payroll to the advance balance, and close the advance once cleared.
     */
    public static function settleForPayroll(int $payrollId): void
    {
        $deductions = \App\Models\Deduction::where('payroll_id', $payrollId)
            ->whereNotNull('loan_advance_id')
            ->get()
            ->groupBy('loan_advance_id');

        foreach ($deductions as $loanId => $rows) {
            $loan = static::find($loanId);
            if (!$loan || !in_array($loan->status, [self::STATUS_DEDUCT_FROM_SALARY, self::STATUS_PAID], true)) {
                continue;
            }
            $loan->outstanding_balance = round(max(0, (float) $loan->outstanding_balance - (float) $rows->sum('amount')), 2);
            if ($loan->outstanding_balance <= 0) {
                $loan->status = self::STATUS_CLOSED;
            }
            $loan->save();
        }
    }
}
