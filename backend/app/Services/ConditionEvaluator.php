<?php

namespace App\Services;

class ConditionEvaluator
{
    /**
     * Evaluate a list of {field, operator, value} rules against metadata. All rules must
     * match (AND). An empty rule set always matches (step has no condition restricting it).
     */
    public static function matches(?array $conditions, array $metadata): bool
    {
        if (empty($conditions)) {
            return true;
        }

        foreach ($conditions as $condition) {
            if (!is_array($condition) || !isset($condition['field'], $condition['operator'])) {
                continue;
            }

            $actual = $metadata[$condition['field']] ?? null;
            $expected = $condition['value'] ?? null;

            if (!self::compare($actual, $condition['operator'], $expected)) {
                return false;
            }
        }

        return true;
    }

    private static function compare(mixed $actual, string $operator, mixed $expected): bool
    {
        if (is_numeric($actual) && is_numeric($expected)) {
            $actual = (float) $actual;
            $expected = (float) $expected;
        }

        return match ($operator) {
            '>' => $actual > $expected,
            '>=' => $actual >= $expected,
            '<' => $actual < $expected,
            '<=' => $actual <= $expected,
            '==' => $actual == $expected,
            '!=' => $actual != $expected,
            default => false,
        };
    }
}
