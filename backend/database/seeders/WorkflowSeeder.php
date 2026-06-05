<?php

namespace Database\Seeders;

use App\Models\Workflow;
use App\Models\ApprovalStep;
use Illuminate\Database\Seeder;

class WorkflowSeeder extends Seeder
{
    public function run(): void
    {
        // Leave Request workflow
        $leave = Workflow::updateOrCreate([
            'name' => 'Leave Request',
            'module' => 'leaves',
        ], [
            'definition' => json_encode(['description' => 'Standard leave approval flow']),
            'company_id' => null,
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $leave->id,
            'step_order' => 1,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'Department Manager',
            'conditions' => json_encode(null),
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $leave->id,
            'step_order' => 2,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'HR Manager',
            'conditions' => json_encode(['min_days' => 3]),
        ]);

        // Payroll approval workflow
        $payroll = Workflow::updateOrCreate([
            'name' => 'Payroll Approval',
            'module' => 'payroll',
        ], [
            'definition' => json_encode(['description' => 'Payroll approval flow']),
            'company_id' => null,
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $payroll->id,
            'step_order' => 1,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'Payroll Manager',
            'conditions' => json_encode(null),
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $payroll->id,
            'step_order' => 2,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'HR Manager',
            'conditions' => json_encode(null),
        ]);

        // Recruitment workflow
        $recruitment = Workflow::updateOrCreate([
            'name' => 'Candidate Interview',
            'module' => 'recruitment',
        ], [
            'definition' => json_encode(['description' => 'Candidate interview and selection workflow']),
            'company_id' => null,
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $recruitment->id,
            'step_order' => 1,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'Recruiter',
            'conditions' => json_encode(null),
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $recruitment->id,
            'step_order' => 2,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'Department Manager',
            'conditions' => json_encode(null),
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $recruitment->id,
            'step_order' => 3,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'HR Manager',
            'conditions' => json_encode(null),
        ]);

        // Attendance Exception workflow
        $attendance = Workflow::updateOrCreate([
            'name' => 'Attendance Exception',
            'module' => 'attendance',
        ], [
            'definition' => json_encode(['description' => 'Manual attendance adjustment approval']),
            'company_id' => null,
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $attendance->id,
            'step_order' => 1,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'Attendance Manager',
            'conditions' => json_encode(null),
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $attendance->id,
            'step_order' => 2,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'HR Manager',
            'conditions' => json_encode(null),
        ]);

        // Performance Review workflow
        $performance = Workflow::updateOrCreate([
            'name' => 'Performance Appraisal',
            'module' => 'performance',
        ], [
            'definition' => json_encode(['description' => 'Annual performance appraisal review']),
            'company_id' => null,
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $performance->id,
            'step_order' => 1,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'Department Manager',
            'conditions' => json_encode(null),
        ]);

        ApprovalStep::updateOrCreate([
            'workflow_id' => $performance->id,
            'step_order' => 2,
        ], [
            'approver_type' => 'role',
            'approver_identifier' => 'HR Manager',
            'conditions' => json_encode(null),
        ]);
    }
}
