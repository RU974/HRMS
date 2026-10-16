<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Attendance policy rules. The permission check stays in the controller
 * (attendance:manage_settings); this only validates the shape and the way the rules relate.
 */
class UpdateAttendancePolicyRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        // Same rule as Controller::authorizePermission, so a caller without access gets 403, not a validation error.
        return (bool) $user && ($user->hasAnyRole([\App\Models\User::ROLE_SUPER_ADMIN]) || $user->hasAnyPermission(['attendance:manage_settings']));
    }

    public function rules(): array
    {
        return [
            'late_after_time'               => 'required|date_format:H:i',
            'allow_manual_status_override'  => 'required|boolean',

            'early_leave_enabled'           => 'sometimes|boolean',
            'early_leave_grace_minutes'     => 'sometimes|integer|min:0|max:240',
            'early_leave_before_time'       => 'sometimes|nullable|date_format:H:i',
            'early_leave_counts_as_late'    => 'sometimes|boolean',

            'full_day_hours'                => 'sometimes|nullable|numeric|min:0.5|max:24',
            'half_day_hours'                => 'sometimes|nullable|numeric|min:0.25|max:24',
            'count_short_as_absent'         => 'sometimes|boolean',

            'half_day_after_late_minutes'   => 'sometimes|nullable|integer|min:1|max:720',
            'absent_after_late_minutes'     => 'sometimes|nullable|integer|min:1|max:1440',

            'lates_per_absent'              => 'sometimes|integer|min:0|max:31',

            'auto_mark_absent'              => 'sometimes|boolean',
            'missing_punch_as_absent'       => 'sometimes|boolean',

            'alerts_enabled'                => 'sometimes|boolean',
            'alerts_email'                  => 'sometimes|boolean',
            'late_alert_threshold'          => 'sometimes|nullable|integer|min:1|max:31',
            'device_stale_minutes'          => 'sometimes|nullable|integer|min:30|max:10080',

            // Not stored: re-judge existing records from this date once the policy is saved.
            'apply_from'                    => 'sometimes|nullable|date|before_or_equal:today',
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            $current = $this->attendancePolicyBefore();
            $value = fn (string $key) => $this->has($key) ? $this->input($key) : ($current[$key] ?? null);

            $full = $value('full_day_hours');
            $half = $value('half_day_hours');
            $halfLate = $value('half_day_after_late_minutes');
            $absentLate = $value('absent_after_late_minutes');

            if ($half !== null && $full === null) {
                $validator->errors()->add('half_day_hours', 'Set the full-day hours before the half-day hours.');
            }
            if ($half !== null && $full !== null && (float) $half >= (float) $full) {
                $validator->errors()->add('half_day_hours', 'Half-day hours must be less than the full-day hours.');
            }
            if ($value('count_short_as_absent') && $half === null) {
                $validator->errors()->add('count_short_as_absent', 'Counting short days as absent needs the half-day hours.');
            }
            if ($halfLate !== null && $absentLate !== null && (int) $absentLate <= (int) $halfLate) {
                $validator->errors()->add('absent_after_late_minutes', 'The absent limit must be later than the half-day limit.');
            }
        }];
    }

    /** The values already stored for the caller's company (or the default it inherits). */
    private function attendancePolicyBefore(): array
    {
        $policy = \App\Models\AttendancePolicy::forCompany($this->user()?->company_id ? (string) $this->user()->company_id : null);

        return $policy ? $policy->only(\App\Models\AttendancePolicy::RULE_FIELDS) : \App\Models\AttendancePolicy::defaults();
    }
}
