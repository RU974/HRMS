<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * The closed-month rule and the change history live in the Attendance model's events. A write that
 * skips model events (query builder updates/deletes, raw table writes, "quiet" saves) would bypass
 * both, so none may appear in app code unless it checks AttendancePeriodGuard itself.
 */
class AttendanceWriteGuardArchitectureTest extends TestCase
{
    /** Files that write through the query builder on purpose and call AttendancePeriodGuard::lockFor(). */
    private const ALLOWED = [
        'Console/Commands/FixShiftedBiometricDates.php',
    ];

    /** @return array<string, string> relative path => contents */
    private function appFiles(): array
    {
        $root = dirname(__DIR__, 2) . '/app';
        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->getExtension() === 'php') {
                $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
                $files[$relative] = (string) file_get_contents($file->getPathname());
            }
        }

        return $files;
    }

    public function test_no_attendance_write_skips_the_model(): void
    {
        $offenders = [];
        foreach ($this->appFiles() as $path => $code) {
            if (in_array($path, self::ALLOWED, true) || $path === 'Models/Attendance.php') {
                continue;
            }

            // Raw table writes.
            if (preg_match('/(DB::table|->from)\(\s*[\'"]attendances[\'"]\s*\)[^;]*->(update|insert|insertOrIgnore|upsert|delete|truncate|increment|decrement)\(/s', $code)) {
                $offenders[] = "$path: raw write to the attendances table";
            }

            // Query-builder writes on the model: Attendance::where(...)->update(...), ->delete() and so on.
            foreach (preg_split('/;\s*$/m', $code) as $statement) {
                if (str_contains($statement, 'recordingAs(')) {
                    continue; // a closure that saves one model instance
                }
                // The write must come straight off the builder; once rows are loaded (get/first/each...)
                // the writes are on model instances, which do fire the events.
                if (preg_match('/\bAttendance::(?!create\(|findOrFail\(|find\(|firstOrNew\(|recordingAs\()[a-z]\w*\((?:(?!->(?:get|first|firstOrFail|cursor|chunk|chunkById|each|pluck|count|exists|value|sole|paginate)\()[^;])*?->(update|insert|insertOrIgnore|upsert|delete|forceDelete|truncate|increment|decrement)\(/s', $statement)) {
                    $offenders[] = "$path: Attendance query-builder write";
                    break;
                }
            }

            // Writes that suppress model events.
            if (preg_match('/\bAttendance::withoutEvents\b|\$(attendance|record|row|stale|orphan)->(saveQuietly|updateQuietly|deleteQuietly)\(/', $code)) {
                $offenders[] = "$path: attendance write without model events";
            }
        }

        $this->assertSame([], $offenders, "These attendance writes would skip the period lock and the change history:\n" . implode("\n", $offenders));
    }

    public function test_the_allowed_raw_writer_checks_the_guard(): void
    {
        foreach (self::ALLOWED as $path) {
            $this->assertStringContainsString('AttendancePeriodGuard', $this->appFiles()[$path], "$path writes raw SQL and must check the guard");
        }
    }
}
