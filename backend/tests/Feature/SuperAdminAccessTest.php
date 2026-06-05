<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SuperAdminAccessTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<int, array{method:string,uri:string}> */
    private function endpoints(): array
    {
        return [
            ['method' => 'get', 'uri' => '/api/v1/dashboard'],
            ['method' => 'get', 'uri' => '/api/v1/companies'],
            ['method' => 'get', 'uri' => '/api/v1/branches'],
            ['method' => 'get', 'uri' => '/api/v1/departments'],
            ['method' => 'get', 'uri' => '/api/v1/designations'],
            ['method' => 'get', 'uri' => '/api/v1/employees'],
            ['method' => 'get', 'uri' => '/api/v1/attendance'],
            ['method' => 'get', 'uri' => '/api/v1/leaves'],
            ['method' => 'get', 'uri' => '/api/v1/payroll'],
            ['method' => 'get', 'uri' => '/api/v1/recruitment'],
            ['method' => 'get', 'uri' => '/api/v1/performance'],
            ['method' => 'get', 'uri' => '/api/v1/training'],
            ['method' => 'get', 'uri' => '/api/v1/assets'],
            ['method' => 'get', 'uri' => '/api/v1/documents'],
            ['method' => 'get', 'uri' => '/api/v1/projects'],
            ['method' => 'get', 'uri' => '/api/v1/announcements'],
            ['method' => 'get', 'uri' => '/api/v1/reports'],
            ['method' => 'get', 'uri' => '/api/v1/settings'],
            ['method' => 'get', 'uri' => '/api/v1/roles'],
            ['method' => 'get', 'uri' => '/api/v1/workflows'],
            ['method' => 'get', 'uri' => '/api/v1/audit-logs'],
            ['method' => 'get', 'uri' => '/api/v1/notifications'],
        ];
    }

    public function test_super_admin_can_access_endpoints_without_401_or_403(): void
    {
        $super = $this->createUserWithRole(User::ROLE_SUPER_ADMIN, [
            'name' => 'Super Admin Test',
            'email' => 'superadmin.access@test',
        ]);

        $this->actingAs($super);

        $failures = [];

        foreach ($this->endpoints() as $endpoint) {
            $method = $endpoint['method'];
            $uri = $endpoint['uri'];

            $resp = $this->{$method}($uri);
            $status = $resp->getStatusCode();

            if (in_array($status, [401, 403], true)) {
                $failures[] = compact('uri', 'status');
            }
        }

        if (!empty($failures)) {
            $message = "Super Admin access failures:\n" . implode("\n", array_map(fn($f) => $f['uri'] . ' => ' . $f['status'], $failures));
            $this->fail($message);
        }

        $this->assertTrue(true); // pass if no failures
    }
}
