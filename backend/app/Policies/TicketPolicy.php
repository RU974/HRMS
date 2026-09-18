<?php

namespace App\Policies;

use App\Models\Ticket;
use App\Models\User;

class TicketPolicy
{
    /**
     * Super Admin is included in the role lists below (rather than relying
     * solely on the Gate::before bypass in AppServiceProvider) so these
     * methods are also correct when called directly as plain methods, e.g.
     * TicketCommentController — Gate::before only short-circuits calls that
     * go through Gate/policy resolution.
     */

    /** Full company-wide ticket visibility, no department scoping. */
    private const COMPANY_WIDE_ROLES = [
        User::ROLE_SUPER_ADMIN,
        User::ROLE_COMPANY_ADMIN,
    ];

    /** Agent-capable, but visibility/listing is scoped to their own department. */
    private const DEPARTMENT_SCOPED_ROLES = [
        User::ROLE_DEPARTMENT_MANAGER,
        User::ROLE_IT_SUPPORT,
        User::ROLE_HR_MANAGER,
    ];

    public function hasCompanyWideAccess(User $user): bool
    {
        return $user->hasAnyRole(self::COMPANY_WIDE_ROLES);
    }

    public function isDepartmentScopedAgent(User $user): bool
    {
        return $user->hasAnyRole(self::DEPARTMENT_SCOPED_ROLES);
    }

    /**
     * Whether this user may view/edit/assign/comment-as-agent on THIS
     * specific ticket. Company-wide roles and HR Manager/IT Support (which
     * are intentionally company-wide, single-team roles) pass regardless of
     * department; Department Manager only passes for its own department's
     * tickets — matching the department scoping already enforced for
     * assignment eligibility in TicketService::getAssignableUsers().
     */
    public function manage(User $user, Ticket $ticket): bool
    {
        if ($this->hasCompanyWideAccess($user) || $user->hasAnyRole([User::ROLE_HR_MANAGER, User::ROLE_IT_SUPPORT])) {
            return true;
        }

        if ($user->hasAnyRole([User::ROLE_DEPARTMENT_MANAGER])) {
            return $user->employee?->department_id === $ticket->department_id;
        }

        return false;
    }

    public function view(User $user, Ticket $ticket): bool
    {
        return $this->manage($user, $ticket) || (string) $ticket->created_by === (string) $user->id;
    }

    public function seeInternalNotes(User $user, Ticket $ticket): bool
    {
        return $this->manage($user, $ticket);
    }
}
