<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Http\Request;

final class RequestTest extends TestCase
{
    public function test_bearer_token_from_redirect_http_authorization(): void
    {
        $previousServer = $_SERVER;
        try {
            $_SERVER = [
                'REQUEST_METHOD' => 'GET',
                'REQUEST_URI' => '/api/auth/me',
                'REDIRECT_HTTP_AUTHORIZATION' => 'Bearer session-token-abc',
            ];

            $request = Request::fromGlobals();
            $this->assertSame('session-token-abc', $request->bearerToken());
        } finally {
            $_SERVER = $previousServer;
        }
    }

    public function test_headers_from_server_resolves_redirect_http_authorization(): void
    {
        $headers = Request::headersFromServer([
            'REDIRECT_HTTP_AUTHORIZATION' => 'Bearer redirect-only-token',
        ]);

        $request = Request::fake('GET', '/api/auth/me', $headers);
        $this->assertSame('redirect-only-token', $request->bearerToken());
    }
}
