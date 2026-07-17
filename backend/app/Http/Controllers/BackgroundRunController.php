<?php

namespace App\Http\Controllers;

use App\Models\BackgroundRun;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BackgroundRunController extends Controller
{
    // ──────────────────────────────────────────────────────────────
    //  GET /api/background-runs/{id}
    //  Polled by the frontend to track payroll generation / employee
    //  import / employee export jobs running on the queue.
    // ──────────────────────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        $run = BackgroundRun::findOrFail($id);
        $this->authorizeAccess($request, $run);

        return $this->ok([
            'id'      => $run->id,
            'type'    => $run->type,
            'status'  => $run->status,
            'summary' => $run->summary,
            'error'   => $run->error,
        ]);
    }

    // ──────────────────────────────────────────────────────────────
    //  GET /api/background-runs/{id}/download
    //  Downloads the CSV produced by a completed employee-export run.
    // ──────────────────────────────────────────────────────────────
    public function download(Request $request, int $id)
    {
        $run = BackgroundRun::findOrFail($id);
        $this->authorizeAccess($request, $run);

        if ($run->type !== BackgroundRun::TYPE_EMPLOYEE_EXPORT || $run->status !== BackgroundRun::STATUS_DONE) {
            abort(404, 'Export is not ready.');
        }

        $path = $run->summary['file_path'] ?? null;
        if (!$path || !Storage::exists($path)) {
            abort(404, 'Export file not found.');
        }

        return Storage::download($path, 'employees.csv');
    }

    private function authorizeAccess(Request $request, BackgroundRun $run): void
    {
        $user = $request->user();
        if ($user && $user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return;
        }
        if ($run->requested_by === $user?->id) {
            return;
        }
        if ($run->company_id !== null && $run->company_id === $user?->company_id && $this->userIsCompanyAdmin($request)) {
            return;
        }
        abort(403, 'You are not authorized to access this background run.');
    }
}
