<?php

namespace App\Http\Controllers;

use App\Models\BiometricDevice;
use App\Models\BiometricSyncLog;
use App\Models\Employee;
use App\Models\BiometricDeviceUser;
use App\Models\EmployeeDeviceMapping;
use App\Services\BiometricSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class BiometricDeviceController extends Controller
{
    public function __construct(private BiometricSyncService $syncService)
    {
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'biometric:view');

        $query = BiometricDevice::query();
        $this->scopeToCompany($request, $query);

        return $this->ok($query->orderBy('name')->get());
    }

    public function show(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:view');

        $query = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $query);

        $device = $query->firstOrFail();

        return $this->ok($device);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'biometric:create');

        $validated = $this->validateDevicePayload($request, true);

        $device = new BiometricDevice($validated);
        if ($request->user()?->company_id) {
            $device->company_id = $request->user()->company_id;
        }
        $device->status = 'never_synced';
        $device->save();

        return $this->ok($device, 'Device created successfully.', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:edit');

        $query = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $query);
        $device = $query->firstOrFail();

        $validated = $this->validateDevicePayload($request, false);

        $device->fill($validated);
        $device->save();

        return $this->ok($device, 'Device updated successfully.');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:delete');

        $query = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $query);
        $device = $query->firstOrFail();

        $device->delete();

        return $this->ok(null, 'Device removed successfully.');
    }

    public function testConnection(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:edit');

        $query = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $query);
        $device = $query->firstOrFail();

        $result = $this->syncService->testConnection($device);

        $device->status = $result['success'] ? 'online' : 'offline';
        $device->save();

        return $this->ok($result);
    }

    public function sync(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:sync');

        $query = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $query);
        $device = $query->firstOrFail();

        $log = $this->syncService->sync($device);

        return $this->ok([
            'sync_log_id' => $log->id,
            'status' => $log->status,
        ], 'Sync started.');
    }

    public function syncLogs(Request $request)
    {
        $this->authorizePermission($request, 'biometric:view');

        $query = BiometricSyncLog::query()->with('device')->orderByDesc('started_at');
        $this->scopeToCompany($request, $query);

        if ($request->filled('device_id')) {
            $query->where('device_id', (int) $request->device_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('date_from')) {
            $query->whereDate('started_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('started_at', '<=', $request->date_to);
        }

        $paginated = $query->paginate(15);

        $paginated->getCollection()->transform(function (BiometricSyncLog $log) {
            $log->device_name = $log->device?->name;
            return $log;
        });

        return $this->ok($paginated);
    }

    public function mappings(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:manage_mapping');

        $deviceQuery = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $deviceQuery);
        $device = $deviceQuery->firstOrFail();

        $mappings = EmployeeDeviceMapping::query()
            ->where('device_id', $device->id)
            ->with('employee')
            ->get()
            ->map(function (EmployeeDeviceMapping $mapping) {
                $mapping->employee_name = $mapping->employee?->first_name
                    ? trim($mapping->employee->first_name . ' ' . $mapping->employee->last_name)
                    : null;
                $mapping->employee_code = $mapping->employee?->employee_number;
                return $mapping;
            });

        return $this->ok($mappings);
    }

    public function saveMapping(Request $request)
    {
        $this->authorizePermission($request, 'biometric:manage_mapping');

        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'device_id' => 'required|exists:biometric_devices,id',
            'device_user_id' => 'required|string|max:100',
            'card_number' => 'nullable|string|max:100',
        ]);

        $deviceQuery = BiometricDevice::query()->whereKey($validated['device_id']);
        $this->scopeToCompany($request, $deviceQuery);
        $deviceQuery->firstOrFail();

        $mapping = EmployeeDeviceMapping::updateOrCreate(
            [
                'employee_id' => $validated['employee_id'],
                'device_id' => $validated['device_id'],
            ],
            [
                'device_user_id' => $validated['device_user_id'],
                'card_number' => $validated['card_number'] ?? null,
                'company_id' => $request->user()?->company_id,
            ]
        );

        return $this->ok($mapping, 'Mapping saved successfully.');
    }

    public function deleteMapping(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:manage_mapping');

        $query = EmployeeDeviceMapping::query()->whereKey($id);
        $this->scopeToCompany($request, $query);
        $mapping = $query->firstOrFail();

        $mapping->delete();

        return $this->ok(null, 'Mapping removed.');
    }

    public function autoMatch(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:manage_mapping');

        $deviceQuery = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $deviceQuery);
        $device = $deviceQuery->firstOrFail();

        $existingEmployeeIds = EmployeeDeviceMapping::where('device_id', $device->id)
            ->pluck('employee_id')
            ->all();

        $employeesQuery = Employee::query()
            ->whereNotNull('employee_number')
            ->whereNotIn('id', $existingEmployeeIds);

        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $employeesQuery->where('company_id', $companyId);
        }

        $suggestions = $employeesQuery->get()->map(function (Employee $employee) {
            $deviceUserId = preg_replace('/\D/', '', (string) $employee->employee_number) ?: $employee->employee_number;

            return [
                'employee_id' => $employee->id,
                'employee_name' => trim($employee->first_name . ' ' . $employee->last_name),
                'employee_code' => $employee->employee_number,
                'device_user_id' => $deviceUserId,
                'confidence' => $deviceUserId === $employee->employee_number ? 0.6 : 0.85,
            ];
        })->values();

        return $this->ok($suggestions);
    }

    public function bulkImportMappings(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:manage_mapping');

        $deviceQuery = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $deviceQuery);
        $device = $deviceQuery->firstOrFail();

        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:csv,txt',
        ]);

        if ($validator->fails()) {
            return $this->fail('Invalid file.', 422, $validator->errors());
        }

        $file = $request->file('file');
        $handle = fopen($file->getRealPath(), 'r');

        $imported = 0;
        $skipped = 0;
        $errors = [];
        $rowNumber = 0;

        while (($row = fgetcsv($handle)) !== false) {
            $rowNumber++;
            if ($rowNumber === 1 && strtolower(trim((string) ($row[0] ?? ''))) === 'employee_code') {
                continue;
            }

            $employeeCode = trim((string) ($row[0] ?? ''));
            $deviceUserId = trim((string) ($row[1] ?? ''));
            $cardNumber = trim((string) ($row[2] ?? '')) ?: null;

            if ($employeeCode === '' || $deviceUserId === '') {
                $skipped++;
                continue;
            }

            $employeeQuery = Employee::query()->where('employee_number', $employeeCode);
            $companyId = $request->user()?->company_id;
            if ($companyId) {
                $employeeQuery->where('company_id', $companyId);
            }
            $employee = $employeeQuery->first();

            if (!$employee) {
                $skipped++;
                $errors[] = "Row {$rowNumber}: employee_code '{$employeeCode}' not found.";
                continue;
            }

            EmployeeDeviceMapping::updateOrCreate(
                ['employee_id' => $employee->id, 'device_id' => $device->id],
                ['device_user_id' => $deviceUserId, 'card_number' => $cardNumber, 'company_id' => $request->user()?->company_id]
            );

            $imported++;
        }

        fclose($handle);

        return $this->ok([
            'imported' => $imported,
            'skipped' => $skipped,
            'errors' => $errors,
        ], 'Import completed.');
    }

    public function agentPush(Request $request)
    {
        $secret = config('services.biometric_agent.secret');
        if (empty($secret) || $request->bearerToken() !== $secret) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'device_id'   => 'nullable|integer',
            'device_ip'   => 'nullable|string',
            'device_port' => 'nullable|integer',
            'punches'     => 'required|array|min:1',
            'punches.*.device_user_id' => 'required|string',
            'punches.*.timestamp'      => 'required|date_format:Y-m-d H:i:s',
            'punches.*.type'           => 'required|in:in,out',
        ]);

        $device = $this->resolveAgentDevice($validated);
        if (!$device) {
            return response()->json(['message' => 'Device not found.'], 422);
        }

        $matched   = 0;
        $unmatched = 0;

        foreach ($validated['punches'] as $raw) {
            $punch = [
                'device_user_id' => $raw['device_user_id'],
                'timestamp'      => \Carbon\Carbon::createFromFormat('Y-m-d H:i:s', $raw['timestamp']),
                'type'           => $raw['type'],
            ];

            $mapping = \App\Models\EmployeeDeviceMapping::where('device_id', $device->id)
                ->where('device_user_id', $punch['device_user_id'])
                ->first();

            if (!$mapping) {
                $unmatched++;
                continue;
            }

            $this->syncService->applyPunchPublic($device, $mapping->employee_id, $punch);
            $matched++;
        }

        $device->update([
            'status'       => 'online',
            'last_sync_at' => now(),
        ]);

        \App\Models\BiometricSyncLog::create([
            'device_id'         => $device->id,
            'company_id'        => $device->company_id,
            'started_at'        => now(),
            'finished_at'       => now(),
            'status'            => $unmatched > 0 && $matched === 0 ? 'failed' : ($unmatched > 0 ? 'partial' : 'success'),
            'records_fetched'   => count($validated['punches']),
            'records_matched'   => $matched,
            'records_unmatched' => $unmatched,
        ]);

        return response()->json([
            'matched'   => $matched,
            'unmatched' => $unmatched,
        ]);
    }

    public function agentSyncUsers(Request $request)
    {
        $secret = config('services.biometric_agent.secret');
        if (empty($secret) || $request->bearerToken() !== $secret) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'device_id'              => 'nullable|integer',
            'device_ip'              => 'nullable|string',
            'device_port'            => 'nullable|integer',
            'users'                  => 'required|array|min:1',
            'users.*.device_user_id' => 'required|string|max:100',
            'users.*.name'           => 'nullable|string|max:255',
        ]);

        $device = $this->resolveAgentDevice($validated);
        if (!$device) {
            return response()->json(['message' => 'Device not found.'], 422);
        }

        $upserted = 0;
        foreach ($validated['users'] as $u) {
            BiometricDeviceUser::updateOrCreate(
                [
                    'device_id'      => $device->id,
                    'device_user_id' => $u['device_user_id'],
                ],
                [
                    'name'       => $u['name'] ?? null,
                    'company_id' => $device->company_id,
                ]
            );
            $upserted++;
        }

        return response()->json(['upserted' => $upserted]);
    }

    public function listDeviceUsers(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:manage_mapping');

        $deviceQuery = BiometricDevice::query()->whereKey($id);
        $this->scopeToCompany($request, $deviceQuery);
        $device = $deviceQuery->firstOrFail();

        $deviceUsers = BiometricDeviceUser::where('device_id', $device->id)
            ->get()
            ->map(function (BiometricDeviceUser $du) use ($device) {
                $mapping = EmployeeDeviceMapping::where('device_id', $device->id)
                    ->where('device_user_id', $du->device_user_id)
                    ->with('employee')
                    ->first();

                return [
                    'device_user_id' => $du->device_user_id,
                    'name'           => $du->name,
                    'mapped'         => (bool) $mapping,
                    'employee_id'    => $mapping?->employee_id,
                    'employee_name'  => $mapping?->employee
                        ? trim($mapping->employee->first_name . ' ' . $mapping->employee->last_name)
                        : null,
                ];
            });

        return $this->ok($deviceUsers);
    }

    public function agentDiscoverDevices(Request $request)
    {
        $secret = config('services.biometric_agent.secret');
        if (empty($secret) || $request->bearerToken() !== $secret) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'devices'                 => 'required|array|min:1',
            'devices.*.ip_address'    => 'required|string|max:100',
            'devices.*.port'          => 'required|integer',
            'devices.*.serial_number' => 'nullable|string|max:100',
            'devices.*.platform'      => 'nullable|string|max:100',
            'devices.*.firmware'      => 'nullable|string|max:100',
            'devices.*.device_name'   => 'nullable|string|max:150',
        ]);

        $created  = 0;
        $existing = 0;

        foreach ($validated['devices'] as $d) {
            $already = BiometricDevice::where('ip_address', $d['ip_address'])
                ->where('port', (int) $d['port'])
                ->exists();

            if ($already) {
                $existing++;
                continue;
            }

            $autoName = trim($d['device_name'] ?? '') ?: trim($d['platform'] ?? '');
            if (!$autoName) {
                $autoName = 'ZKTeco @ ' . $d['ip_address'];
            }

            BiometricDevice::create([
                'name'                  => $autoName,
                'connection_type'       => 'tcp',
                'ip_address'            => $d['ip_address'],
                'port'                  => (int) $d['port'],
                'comm_key'              => '0',
                'device_model'          => trim($d['platform'] ?? 'ZKTeco') ?: 'ZKTeco',
                'sync_mode'             => 'scheduled',
                'sync_interval_minutes' => 15,
                'timezone'              => 'Asia/Karachi',
                'status'                => 'never_synced',
                'company_id'            => null,
            ]);

            $created++;
        }

        return response()->json(['created' => $created, 'existing' => $existing]);
    }

    public function listUnconfigured(Request $request)
    {
        $this->authorizePermission($request, 'biometric:create');

        $devices = BiometricDevice::whereNull('company_id')
            ->where('status', 'never_synced')
            ->orderBy('created_at', 'desc')
            ->get();

        return $this->ok($devices);
    }

    public function claimDevice(Request $request, $id)
    {
        $this->authorizePermission($request, 'biometric:create');

        $device = BiometricDevice::whereKey($id)->whereNull('company_id')->firstOrFail();

        $validated = $request->validate([
            'name'                  => 'required|string|max:150',
            'timezone'              => 'required|string|max:64',
            'comm_key'              => 'nullable|string|max:255',
            'sync_interval_minutes' => 'nullable|integer|min:1|max:1440',
        ]);

        $device->fill([
            'name'                  => $validated['name'],
            'timezone'              => $validated['timezone'],
            'comm_key'              => $validated['comm_key'] ?? '0',
            'sync_interval_minutes' => $validated['sync_interval_minutes'] ?? 15,
            'company_id'            => $request->user()?->company_id,
        ]);
        $device->save();

        return $this->ok($device, 'Device claimed successfully.');
    }

    private function resolveAgentDevice(array $data): ?BiometricDevice
    {
        if (!empty($data['device_id'])) {
            return BiometricDevice::find($data['device_id']);
        }

        if (!empty($data['device_ip'])) {
            $port = $data['device_port'] ?? 4370;
            return BiometricDevice::where('ip_address', $data['device_ip'])
                ->where('port', $port)
                ->first();
        }

        return null;
    }

    private function scopeToCompany(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->where('company_id', $companyId);
        }
    }

    private function validateDevicePayload(Request $request, bool $isCreate): array
    {
        $required = $isCreate ? 'required' : 'sometimes|required';

        $rules = [
            'name' => "$required|string|max:150",
            'branch_id' => 'nullable|integer',
            'connection_type' => "$required|in:tcp,cloud_api",
            'ip_address' => 'nullable|string|max:100',
            'port' => 'nullable|integer|min:1|max:65535',
            'comm_key' => 'nullable|string|max:255',
            'device_model' => 'nullable|string|max:100',
            'api_endpoint' => 'nullable|url|max:255',
            'api_key' => 'nullable|string|max:255',
            'sync_mode' => "$required|in:realtime,scheduled",
            'sync_interval_minutes' => 'nullable|integer|min:1|max:1440',
            'timezone' => "$required|string|max:64",
        ];

        $validated = $request->validate($rules);

        $connectionType = $validated['connection_type'] ?? null;

        if ($connectionType === 'tcp') {
            if (empty($validated['ip_address'])) {
                abort(422, 'IP address is required for TCP/IP devices.');
            }
        }

        if ($connectionType === 'cloud_api') {
            if (empty($validated['api_endpoint'])) {
                abort(422, 'API endpoint is required for cloud API devices.');
            }
        }

        return $validated;
    }
}