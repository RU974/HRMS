<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CorsSanctumTest extends TestCase
{
    use RefreshDatabase;

    public function test_cors_preflight_allows_frontend_origin_and_credentials(): void
    {
        config([
            'cors.allowed_origins' => ['http://localhost:5173'],
            'cors.paths' => ['api/*', 'sanctum/csrf-cookie'],
            'cors.supports_credentials' => true,
        ]);

        $response = $this->options('/api/v1/auth/login', [], [
            'Origin' => 'http://localhost:5173',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'Content-Type',
        ]);

        // Preflight may return 204 No Content; accept 200 or 204
        $this->assertTrue(in_array($response->getStatusCode(), [200, 204]));
        $response->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        $response->assertHeader('Access-Control-Allow-Credentials', 'true');
    }
}


