<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\BiometricDevice;
use App\Models\BiometricSyncLog;
use App\Models\EmployeeDeviceMapping;
use Carbon\Carbon;

class BiometricSyncService
{
    public function testConnection(BiometricDevice $device): array
    {
        try {
            if ($device->connection_type === 'tcp') {
                return $this->testTcpConnection($device);
            }

            return $this->testCloudConnection($device);
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'message' => 'Connection failed: ' . $e->getMessage(),
                'device_time' => null,
            ];
        }
    }

    private function testTcpConnection(BiometricDevice $device): array
    {
        if (empty($device->ip_address) || empty($device->port)) {
            return [
                'success' => false,
                'message' => 'Device IP address and port must be configured.',
                'device_time' => null,
            ];
        }

        $connection = @fsockopen($device->ip_address, (int) $device->port, $errno, $errstr, 3);

        if (!$connection) {
            return [
                'success' => false,
                'message' => "Unable to reach device at {$device->ip_address}:{$device->port} ({$errstr}).",
                'device_time' => null,
            ];
        }

        fclose($connection);

        return [
            'success' => true,
            'message' => 'Device responded successfully.',
            'device_time' => now()->toIso8601String(),
        ];
    }

    private function testCloudConnection(BiometricDevice $device): array
    {
        if (empty($device->api_endpoint) || empty($device->api_key)) {
            return [
                'success' => false,
                'message' => 'API endpoint and API key must be configured.',
                'device_time' => null,
            ];
        }

        $response = \Illuminate\Support\Facades\Http::withToken($device->api_key)
            ->timeout(5)
            ->get(rtrim($device->api_endpoint, '/') . '/ping');

        if ($response->successful()) {
            return [
                'success' => true,
                'message' => 'Cloud API responded successfully.',
                'device_time' => $response->json('server_time') ?? now()->toIso8601String(),
            ];
        }

        return [
            'success' => false,
            'message' => 'Cloud API returned status ' . $response->status() . '.',
            'device_time' => null,
        ];
    }

    public function sync(BiometricDevice $device): BiometricSyncLog
    {
        $log = BiometricSyncLog::create([
            'device_id' => $device->id,
            'started_at' => now(),
            'status' => 'in_progress',
            'company_id' => $device->company_id,
        ]);

        try {
            $punches = $this->fetchPunches($device);

            $matched = 0;
            $unmatched = 0;

            foreach ($punches as $punch) {
                $mapping = EmployeeDeviceMapping::where('device_id', $device->id)
                    ->where('device_user_id', (string) $punch['device_user_id'])
                    ->first();

                if (!$mapping) {
                    $unmatched++;
                    continue;
                }

                $this->applyPunch($device, $mapping->employee_id, $punch);
                $matched++;
            }

            $status = 'success';
            if ($unmatched > 0 && $matched === 0) {
                $status = 'failed';
            } elseif ($unmatched > 0) {
                $status = 'partial';
            }

            $log->update([
                'finished_at' => now(),
                'records_fetched' => count($punches),
                'records_matched' => $matched,
                'records_unmatched' => $unmatched,
                'status' => $status,
            ]);

            $device->update([
                'status' => 'online',
                'last_sync_at' => now(),
            ]);
        } catch (\Throwable $e) {
            $log->update([
                'finished_at' => now(),
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            $device->update(['status' => 'offline']);
        }

        return $log->fresh();
    }

    protected function fetchPunches(BiometricDevice $device): array
    {
        if ($device->connection_type === 'cloud_api') {
            return $this->fetchPunchesFromCloud($device);
        }

        return $this->fetchPunchesFromTcpDevice($device);
    }

    protected function fetchPunchesFromCloud(BiometricDevice $device): array
    {
        if (empty($device->api_endpoint) || empty($device->api_key)) {
            return [];
        }

        $since = $device->last_sync_at ? $device->last_sync_at->toIso8601String() : now()->subDay()->toIso8601String();

        $response = \Illuminate\Support\Facades\Http::withToken($device->api_key)
            ->timeout(15)
            ->get(rtrim($device->api_endpoint, '/') . '/attendance-logs', ['since' => $since]);

        if (!$response->successful()) {
            throw new \RuntimeException('Failed to fetch attendance logs from cloud API: HTTP ' . $response->status());
        }

        $records = $response->json('data', []);

        return array_map(function ($record) {
            return [
                'device_user_id' => (string) ($record['user_id'] ?? ''),
                'timestamp' => Carbon::parse($record['timestamp']),
                'type' => $record['type'] ?? 'in',
            ];
        }, $records);
    }

    protected function fetchPunchesFromTcpDevice(BiometricDevice $device): array
    {
        // Integration point for TCP/IP biometric devices (ZKTeco, eSSL,
        // Hikvision, etc.). These typically require a vendor SDK that is
        // not directly callable from PHP. The recommended approach is a
        // small companion service/daemon that talks to the device over
        // $device->ip_address:$device->port using the vendor SDK and
        // exposes the resulting punches via a local API that this method
        // then calls.
        return [];
    }

    protected function applyPunch(BiometricDevice $device, int $employeeId, array $punch): void
    {
        $timestamp = $punch['timestamp'];
        $date = $timestamp->copy()->setTimezone($device->timezone)->toDateString();

        $attendance = Attendance::firstOrNew([
            'employee_id' => $employeeId,
            'date' => $date,
        ]);

        $attendance->source = 'biometric';
        $attendance->biometric_device_id = $device->id;

        if (($punch['type'] ?? 'in') === 'out') {
            $attendance->check_out = $timestamp;
        } else {
            if (!$attendance->check_in) {
                $attendance->check_in = $timestamp;
            }
            $attendance->check_out = $timestamp;
        }

        if (!$attendance->status) {
            $attendance->status = 'present';
        }

        $attendance->save();
    }
}