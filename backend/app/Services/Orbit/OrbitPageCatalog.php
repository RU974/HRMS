<?php

namespace App\Services\Orbit;

use App\Models\User;

/**
 * Pages Orbit may point people to. Mirrors build/src/app/routes/app-routes.tsx.
 * A null permission list means every signed-in user can open the page.
 */
class OrbitPageCatalog
{
    private const PAGES = [
        ['/dashboard', 'Dashboard', 'Overview and personal workspace', null],
        ['/profile', 'My Profile', 'Personal details, password, photo', null],
        ['/employees', 'Employees', 'Employee directory and records', ['employees:view', 'employees:edit']],
        ['/employees/new', 'Add Employee', 'Create a new employee', ['employees:create']],
        ['/attendance', 'Attendance', 'Check in/out, attendance records, corrections', ['attendance:view', 'attendance:manage_settings', 'attendance:approve']],
        ['/attendance/corrections', 'Attendance Corrections', 'Review attendance correction requests', ['attendance:approve', 'attendance:manage_settings']],
        ['/payroll', 'Payroll', 'Payroll, payslips, salary, bonuses, deductions, loans', ['payroll:view', 'payroll:manage_settings']],
        ['/leaves', 'Leaves', 'Apply for leave, balances, approvals', ['leaves:view', 'leaves:approve', 'leaves:create']],
        ['/approvals', 'Approvals', 'Pending approval requests', ['approvals:view', 'approvals:manage_settings', 'approvals:approve']],
        ['/workflows', 'Workflows', 'Approval workflow builder', ['approvals:manage_settings']],
        ['/recruitment', 'Recruitment', 'Job openings, candidates, interviews, onboarding', ['recruitment:view']],
        ['/performance', 'Performance', 'Appraisals, goals, KPIs, reviews', ['performance:view', 'performance:manage_settings']],
        ['/tickets', 'Tickets', 'Raise and track internal support tickets', ['tickets:view', 'tickets:create', 'tickets:manage_settings']],
        ['/inventory', 'Inventory', 'Company assets and assignments', ['inventory:view', 'inventory:create', 'inventory:edit', 'inventory:manage_settings']],
        ['/announcements', 'Announcements', 'Company announcements', ['announcement:view', 'announcement:edit']],
        ['/notifications', 'Notifications', 'Your notifications', ['notification:view', 'notification:edit']],
        ['/chat', 'Chat', 'Messages and calls', ['chat:view', 'chat:create']],
        ['/employee-documents', 'Employee Documents', 'Employee document storage', ['documents:view', 'documents:edit']],
        ['/departments', 'Departments', 'Manage departments', ['settings:manage_settings']],
        ['/designations', 'Designations', 'Manage designations', ['settings:manage_settings']],
        ['/shifts', 'Shifts', 'Manage work shifts', ['attendance:edit']],
        ['/holidays', 'Holidays', 'Company holiday calendar', ['attendance:edit']],
        ['/reports', 'Reports', 'Employee, attendance, leave, payroll, inventory reports', ['reports:view', 'reports:manage_settings', 'reports:view_own']],
        ['/settings', 'Settings', 'Users, roles, company, theme, licensing', ['users:view', 'settings:manage_settings']],
        ['/search', 'Search', 'Global search', null],
    ];

    /** @return array<int, array{path: string, label: string, description: string}> */
    public function forUser(User $user): array
    {
        $pages = [];
        foreach (self::PAGES as [$path, $label, $description, $permissions]) {
            if ($permissions !== null && !$user->hasAnyPermission($permissions)
                && !$user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
                continue;
            }
            $pages[] = ['path' => $path, 'label' => $label, 'description' => $description];
        }

        return $pages;
    }
}
