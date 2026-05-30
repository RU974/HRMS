<?php

namespace App\Http\Controllers;

use App\Models\EmployeeDocument;
use App\Models\EmployeeDocumentVersion;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeDocumentController extends Controller
{
    public function index(Request $request)
    {
        $query = EmployeeDocument::with(['employee', 'versions']);
        if ($request->has('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }
        $documents = $query->latest()->paginate(15);
        $documents->setCollection($documents->getCollection()->filter(fn ($doc) => $this->canAccess($request, $doc))->values());

        return $this->ok($documents);
    }

    public function show(Request $request, $id)
    {
        $document = EmployeeDocument::with(['employee', 'versions'])->findOrFail($id);
        $this->ensureAccess($request, $document);
        return $this->ok($document);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage employee documents');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'title' => 'required|string|max:255',
            'type' => 'nullable|string|max:100',
            'file_path' => 'nullable|string|max:1000',
            'visibility' => 'nullable|in:hr_only,manager_only,employee_self',
            'file' => 'nullable|file|mimes:pdf,jpg,jpeg,png,doc,docx|max:10240',
            'expiry_date' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);
        if ($request->hasFile('file')) {
            $validated['file_path'] = $request->file('file')->store('employee-documents', 'public');
        }
        $validated['visibility'] = $validated['visibility'] ?? 'hr_only';
        $document = EmployeeDocument::create($validated);

        return $this->ok($document->load('employee'), 'Employee document added successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage employee documents');
        $document = EmployeeDocument::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'title' => 'sometimes|string|max:255',
            'type' => 'nullable|string|max:100',
            'file_path' => 'nullable|string|max:1000',
            'visibility' => 'sometimes|in:hr_only,manager_only,employee_self',
            'file' => 'nullable|file|mimes:pdf,jpg,jpeg,png,doc,docx|max:10240',
            'expiry_date' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        if ($request->hasFile('file')) {
            if (!empty($document->file_path)) {
                EmployeeDocumentVersion::create([
                    'employee_document_id' => $document->id,
                    'file_path' => $document->file_path,
                    'changed_by' => $request->user()?->id,
                ]);
            }
            $validated['file_path'] = $request->file('file')->store('employee-documents', 'public');
        }

        $document->update($validated);
        return $this->ok($document->load(['employee', 'versions']), 'Employee document updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage employee documents');
        $document = EmployeeDocument::with('versions')->findOrFail($id);

        if (!empty($document->file_path) && Storage::disk('public')->exists($document->file_path)) {
            Storage::disk('public')->delete($document->file_path);
        }
        foreach ($document->versions as $version) {
            if (Storage::disk('public')->exists($version->file_path)) {
                Storage::disk('public')->delete($version->file_path);
            }
        }

        $document->delete();
        return $this->ok(null, 'Employee document deleted successfully');
    }

    public function preview(Request $request, $id): StreamedResponse
    {
        $document = EmployeeDocument::findOrFail($id);
        $this->ensureAccess($request, $document);
        if (empty($document->file_path) || !Storage::disk('public')->exists($document->file_path)) {
            abort(404, 'Document file not found.');
        }
        $fullPath = Storage::disk('public')->path($document->file_path);
        $mime = mime_content_type($fullPath) ?: 'application/octet-stream';
        return response()->stream(fn () => print(file_get_contents($fullPath)), 200, [
            'Content-Type' => $mime,
            'Content-Disposition' => 'inline; filename="' . basename($document->file_path) . '"',
        ]);
    }

    public function download(Request $request, $id): StreamedResponse
    {
        $document = EmployeeDocument::findOrFail($id);
        $this->ensureAccess($request, $document);
        if (empty($document->file_path) || !Storage::disk('public')->exists($document->file_path)) {
            abort(404, 'Document file not found.');
        }
        return Storage::disk('public')->download($document->file_path, basename($document->file_path));
    }

    private function ensureAccess(Request $request, EmployeeDocument $document): void
    {
        if (!$this->canAccess($request, $document)) {
            abort(403, 'You are not authorized to access this document.');
        }
    }

    private function canAccess(Request $request, EmployeeDocument $document): bool
    {
        $user = $request->user();
        if ($user?->can('manage employee documents')) {
            return true;
        }
        if ($document->visibility === 'manager_only') {
            return $user?->can('view employees') || $user?->can('view attendance');
        }
        if ($document->visibility === 'employee_self') {
            return $user?->id === $document->employee?->user_id;
        }
        return false;
    }
}
