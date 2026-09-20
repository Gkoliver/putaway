<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Auth\AuthController;
use Putaway\Auth\AuthService;
use Putaway\Auth\NullMailer;
use Putaway\Http\Request;

final class AuthControllerTest extends TestCase
{
    private AuthController $controller;
    private NullMailer $mailer;
    private PDO $pdo;

    protected function setUp(): void
    {
        $this->pdo = new PDO('sqlite::memory:');
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->exec(
            'CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL);
             CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
             CREATE TABLE magic_link_tokens (id TEXT PRIMARY KEY, email TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT NULL);',
        );
        $this->mailer = new NullMailer();
        $this->controller = new AuthController(new AuthService(
            $this->pdo,
            $this->mailer,
            'https://put-away.com',
            'noreply@put-away.com',
            2_592_000,
        ));
    }

    public function test_api_auth_flow(): void
    {
        $request = Request::fake(
            'POST',
            '/api/auth/magic-link',
            ['Content-Type' => 'application/json'],
            '{"email":"person@example.com"}',
        );
        self::assertSame(201, $this->controller->requestMagicLink($request)->status);

        $token = $this->magicToken();
        $verified = $this->controller->verifyApi(
            Request::fake('GET', '/api/auth/verify?token=' . $token),
        );
        $payload = json_decode($verified->body, true, flags: JSON_THROW_ON_ERROR);
        self::assertSame(200, $verified->status);
        self::assertSame('person@example.com', $payload['user']['email']);
        self::assertSame('no-store', $verified->headers['Cache-Control']);

        $headers = ['Authorization' => 'Bearer ' . $payload['token']];
        $me = $this->controller->me(Request::fake('GET', '/api/auth/me', $headers));
        self::assertSame($payload['user'], json_decode($me->body, true, flags: JSON_THROW_ON_ERROR)['user']);

        self::assertSame(
            204,
            $this->controller->signOut(Request::fake('POST', '/api/auth/sign-out', $headers))->status,
        );
        self::assertSame(
            401,
            $this->controller->me(Request::fake('GET', '/api/auth/me', $headers))->status,
        );
    }

    public function test_web_get_verify_shows_handoff_without_consuming_token(): void
    {
        $this->controller->requestMagicLink(
            Request::fake('POST', '/api/auth/magic-link', [], '{"email":"person@example.com"}'),
        );

        $response = $this->controller->verifyWeb(
            Request::fake('GET', '/auth/verify?token=' . $this->magicToken()),
        );

        self::assertSame(200, $response->status);
        self::assertStringContainsString('Continue on web', $response->body);
        self::assertStringContainsString('Open in Putaway app', $response->body);
        self::assertStringContainsString('putaway://auth/verify?token=', $response->body);
        self::assertSame(0, (int) $this->pdo->query(
            'SELECT COUNT(*) FROM magic_link_tokens WHERE consumed_at IS NOT NULL',
        )->fetchColumn());
    }

    public function test_web_post_verify_consumes_token_sets_cookie_and_redirects(): void
    {
        $this->controller->requestMagicLink(
            Request::fake('POST', '/api/auth/magic-link', [], '{"email":"person@example.com"}'),
        );
        $token = $this->magicToken();

        $response = $this->controller->consumeWeb(
            Request::fake('POST', '/auth/verify', [], 'token=' . rawurlencode($token)),
        );

        self::assertSame(302, $response->status);
        self::assertSame('/inventory', $response->headers['Location']);
        self::assertStringContainsString(
            'putaway_session=',
            $response->headers['Set-Cookie'],
        );
        self::assertStringContainsString('HttpOnly; Secure; SameSite=Lax', $response->headers['Set-Cookie']);
        self::assertSame(1, (int) $this->pdo->query(
            'SELECT COUNT(*) FROM magic_link_tokens WHERE consumed_at IS NOT NULL',
        )->fetchColumn());

        $reused = $this->controller->verifyApi(
            Request::fake('GET', '/api/auth/verify?token=' . $token),
        );
        self::assertSame(400, $reused->status);
        self::assertSame('no-store', $reused->headers['Cache-Control']);
    }

    public function test_web_sign_out_revokes_cookie_session_and_clears_cookie(): void
    {
        $this->controller->requestMagicLink(
            Request::fake('POST', '/api/auth/magic-link', [], '{"email":"person@example.com"}'),
        );
        $verified = $this->controller->verifyApi(
            Request::fake('GET', '/api/auth/verify?token=' . $this->magicToken()),
        );
        $sessionToken = json_decode($verified->body, true, flags: JSON_THROW_ON_ERROR)['token'];

        $response = $this->controller->signOutWeb(
            Request::fake('POST', '/sign-out', ['Cookie' => 'putaway_session=' . $sessionToken]),
        );

        self::assertSame(303, $response->status);
        self::assertSame('/sign-in', $response->headers['Location']);
        self::assertStringContainsString('putaway_session=;', $response->headers['Set-Cookie']);
        self::assertNull($this->pdo->query(
            "SELECT token FROM sessions WHERE token = '$sessionToken'",
        )->fetchColumn() ?: null);
    }

    public function test_invalid_email_returns_400(): void
    {
        $response = $this->controller->requestMagicLink(
            Request::fake('POST', '/api/auth/magic-link', [], '{"email":"invalid"}'),
        );

        self::assertSame(400, $response->status);
    }

    private function magicToken(): string
    {
        self::assertNotNull($this->mailer->lastUrl);
        parse_str((string) parse_url($this->mailer->lastUrl, PHP_URL_QUERY), $query);
        return (string) $query['token'];
    }
}
