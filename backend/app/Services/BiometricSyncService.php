<?php

namespace App\Services;

use App\Models\Attendance;
use App\Services\AttendanceCalculator;
use App\Models\AttendancePolicy;
use App\Models\BiometricDevice;
use App\Models\BiometricSyncLog;
use App\Models\Employee;
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

        // ZKTeco devices communicate over UDP — a TCP socket test from a
        // cloud server will always time out even when the device is healthy.
        // Connection is verified by the local agent when it successfully pushes.
        return [
            'success' => true,
            'message' => 'Device is managed by the local agent. Check Sync Logs for live status.',
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
        // TCP/IP devices (e.g. ZKTeco K50) are on the company LAN and cannot be
        // reached from the cloud server. Attendance is pushed by the local agent.
        // Triggering a server-side sync for TCP devices would always fail and
        // incorrectly mark the device offline.
        if ($device->connection_type === 'tcp') {
            $log = BiometricSyncLog::create([
                'device_id'   => $device->id,
                'company_id'  => $device->company_id,
                'started_at'  => now(),
                'finished_at' => now(),
                'status'      => 'failed',
                'records_fetched'   => 0,
                'records_matched'   => 0,
                'records_unmatched' => 0,
                'error_message' => 'TCP/IP devices are managed by the local biometric agent. '
                    . 'Use the agent to push attendance. "Sync Now" is only available for Cloud API devices.',
            ]);

            return $log->fresh();
        }

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

            app(AttendanceAbsenceService::class)->markAbsences(now()->subDays(3), now()->subDay(), $device->company_id);
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
        if (empty($device->ip_address) || empty($device->port)) {
            throw new \RuntimeException('Device IP address and port must be configured.');
        }

        $zk = new \Rats\Zkteco\Lib\ZKTeco($device->ip_address, (int) $device->port);

        $connected = $zk->connect();
        if (!$connected) {
            throw new \RuntimeException(
                "Failed to connect to ZKTeco device at {$device->ip_address}:{$device->port}."
            );
        }

        // Authenticate with comm_key when set.
        // ZKTeco protocol CMD_AUTH (1102): payload = pack('I', comm_key XOR session_id).
        if (!empty($device->comm_key)) {
            $authPayload = pack('I', (int) $device->comm_key ^ $zk->_session_id);
            $authResult  = $zk->_command(1102, $authPayload);
            if ($authResult === false) {
                $zk->disconnect();
                throw new \RuntimeException(
                    "Authentication failed for device at {$device->ip_address}:{$device->port}. Check the comm_key."
                );
            }
        }

        $deviceDisabled = false;
        try {
            $zk->disableDevice();
            $deviceDisabled = true;

            $rawLogs = $zk->getAttendance();

            if (!is_array($rawLogs)) {
                throw new \RuntimeException('Device returned invalid attendance data.');
            }

            $since = $device->last_sync_at ?? now()->subDay();

            $punches = [];
            foreach ($rawLogs as $log) {
                $timestamp = Carbon::createFromFormat('Y-m-d H:i:s', $log['timestamp']);
                if (!$timestamp || $timestamp->lt($since)) {
                    continue;
                }

                // state: 0=check-in, 1=check-out, 4=overtime-in, 5=overtime-out
                $type = in_array((int) $log['state'], [1, 5], true) ? 'out' : 'in';

                $punches[] = [
                    'device_user_id' => (string) $log['id'],
                    'timestamp'      => $timestamp,
                    'type'           => $type,
                ];
            }

            // NOTE: Do NOT call clearAttendance() here. The local agent
            // (agent.py, CLEAR_AFTER_SYNC=true) is responsible for clearing
            // device logs after a successful push. Clearing here would race
            // with the agent and cause data loss.
            return $punches;
        } finally {
            if ($deviceDisabled) {
                $zk->enableDevice();
            }
            $zk->disconnect();
        }
    }

    public function applyPunchPublic(BiometricDevice $device, int $employeeId, array $punch): void
    {
        $this->applyPunch($device, $employeeId, $punch);
    }

    protected function applyPunch(BiometricDevice $device, int $employeeId, array $punch): void
    {
        $timestamp = $punch['timestamp'];
        // Device punches are wall-clock times in the device's own timezone (the agent
        // sends "Y-m-d H:i:s" with no offset), and check_in/check_out are stored as
        // that same wall-clock. Shifting the timezone here moved evening punches
        // (e.g. 20:00 on the 12th) onto the next calendar day, so use the date as-is.
        $date = $timestamp->toDateString();

        $type  = $punch['type'] ?? 'in';
        $shift = Employee::find($employeeId)?->shift;
        $calculator = new AttendanceCalculator();

        // Night shifts: the record's date is the shift-start date, so a punch after
        // midnight must be attached to the still-open record from the previous evening.
        // A record whose check_out precedes its check_in (stale data from an older sync that
        // stored the morning punch on the wrong day) is still effectively open.
        $open = Attendance::where('employee_id', $employeeId)
            ->whereNotNull('check_in')
            ->where(function ($q) {
                $q->whereNull('check_out')->orWhereColumn('check_out', '<', 'check_in');
            })
            ->where('check_in', '>=', $timestamp->copy()->subHours(20)->toDateTimeString())
            ->where('check_in', '<', $timestamp->toDateTimeString())
            ->whereDate('date', '<', $date)
            ->orderByDesc('check_in')
            ->first();

        // With no shift assigned, an evening check-in followed by a morning punch is
        // still treated as a night shift rather than a new day.
        $overnight = $calculator->isOvernightShift($shift)
            || (!$shift && $open
                && (int) Carbon::parse($open->check_in)->format('G') >= 16
                && (int) $timestamp->format('G') < 12);

        if ($open && ($type === 'out' || ($overnight
            && $timestamp->getTimestamp() - Carbon::parse($open->check_in)->getTimestamp() >= 3600))) {
            $open->check_out = $timestamp;
            $open->source = 'biometric';
            $open->biometric_device_id = $device->id;
            $open->save();
            return;
        }

        $attendance = Attendance::firstOrNew([
            'employee_id' => $employeeId,
            'date' => $date,
        ]);

        $attendance->source = 'biometric';
        $attendance->biometric_device_id = $device->id;

        // A record whose check_in falls on an earlier calendar day than its date is a
        // leftover from the old timezone-shift bug; today's real punch must replace it.
        if ($attendance->check_in && $attendance->check_in->toDateString() < $date) {
            $attendance->check_in = null;
            $attendance->check_out = null;
            $attendance->status = null;
        }

        if ($type === 'out') {
            // A check-out earlier than the check-in is the previous night's punch, not this day's.
            if (!$attendance->check_in || $timestamp->gt($attendance->check_in)) {
                $attendance->check_out = $timestamp;
            }
        } else {
            if (!$attendance->check_in) {
                $attendance->check_in = $timestamp;

                // Derive late/present status from shift + policy
                $policy = AttendancePolicy::query()->first();
                $shift  = Employee::find($employeeId)?->effectiveShift();
                $attendance->status = (new AttendanceCalculator())->deriveStatusFromCheckIn(
                    $policy,
                    $shift,
                    $timestamp->toDateTimeString(),
                    'present'
                );
            }
        }

        if ($attendance->check_in && $attendance->check_out && $attendance->check_out->lt($attendance->check_in)) {
            $attendance->check_out = null;
        }

        if (!$attendance->status) {
            $attendance->status = 'present';
        }

        $attendance->save();
    }
}