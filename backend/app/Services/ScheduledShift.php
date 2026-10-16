<?php

namespace App\Services;

use App\Models\Shift;

/**
 * What an employee is scheduled to do on one date: a shift (department grace already applied)
 * or nothing, and whether the date counts as a working day. Built by ShiftResolver, or read
 * back from the snapshot stored on an attendance record.
 */
class ScheduledShift
{
    public const SOURCE_DEFAULT = 'default';
    public const SOURCE_ROSTER = 'roster';
    public const SOURCE_ROTATION = 'rotation';
    public const SOURCE_OVERRIDE = 'override';
    public const SOURCE_SWAP = 'swap';
    public const SOURCE_NONE = 'none';

    public function __construct(
        public readonly ?Shift $shift,
        public readonly bool $isWorkingDay,
        public readonly string $source = self::SOURCE_DEFAULT,
        public readonly ?int $sourceId = null,
    ) {
    }

    /** @return array<string, mixed> */
    public function toSnapshot(): array
    {
        $shift = $this->shift;

        return [
            'v' => 1,
            'shift_id' => $shift?->id,
            'name' => $shift?->name,
            'start_time' => $shift?->start_time ? self::time($shift->start_time) : null,
            'end_time' => $shift?->end_time ? self::time($shift->end_time) : null,
            'continues_after_midnight' => (bool) ($shift?->continues_after_midnight),
            'grace_minutes' => (int) ($shift?->grace_minutes ?? 0),
            'working_days' => $shift ? $shift->working_days : null,
            'is_working_day' => $this->isWorkingDay,
            'source' => $this->source,
            'source_id' => $this->sourceId,
            'captured_at' => now()->toDateTimeString(),
        ];
    }

    public static function fromSnapshot(?array $snapshot): ?self
    {
        if (!$snapshot || !array_key_exists('is_working_day', $snapshot)) {
            return null;
        }

        $shift = null;
        if (!empty($snapshot['start_time']) && !empty($snapshot['end_time'])) {
            $shift = new Shift([
                'name' => $snapshot['name'] ?? null,
                'start_time' => $snapshot['start_time'],
                'end_time' => $snapshot['end_time'],
                'continues_after_midnight' => (bool) ($snapshot['continues_after_midnight'] ?? false),
                'grace_minutes' => (int) ($snapshot['grace_minutes'] ?? 0),
                'working_days' => $snapshot['working_days'] ?? null,
            ]);
            $shift->forceFill(['id' => $snapshot['shift_id'] ?? null]);
        }

        return new self($shift, (bool) $snapshot['is_working_day'], (string) ($snapshot['source'] ?? self::SOURCE_DEFAULT), $snapshot['source_id'] ?? null);
    }

    private static function time(mixed $value): string
    {
        $value = (string) $value;

        return strlen($value) === 5 ? $value . ':00' : $value;
    }
}
