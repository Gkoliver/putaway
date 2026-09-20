<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Auth\AuthService;
use Putaway\Auth\NullMailer;

final class AuthServiceTest extends TestCase
{
    private PDO $pdo;
    private NullMailer $mailer;
    private AuthService $auth;

    protected function setUp(): void
    {
        $this->pdo = new PDO('sqlite::memory:');
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->exec(
            'CREATE TABLE users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE magic_link_tokens (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                consumed_at TEXT NULL
            );',
        );

        $this->mailer = new NullMailer();
        $this->auth = new AuthService(
            $this->pdo,
            $this->mailer,
            'https://put-away.com',
            'noreply@put-away.com',
            2_592_000,
        );
    }

    public function test_request_magic_link_stores_token_and_sends_url(): void
    {
        $this->auth->requestMagicLink(' Person@Example.com ');

        $row = $this->pdo->query('SELECT email, token FROM magic_link_tokens')->fetch();

        self::assertSame('person@example.com', $row['email']);
        self::assertSame(
            'https://put-away.com/auth/verify?token=' . $row['token'],
            $this->mailer->lastUrl,
        );
    }

    public function test_consume_creates_session_and_bearer_resolves_user(): void
    {
        $this->auth->requestMagicLink('person@example.com');
        $token = $this->tokenFromLastUrl();

        $result = $this->auth->consumeMagicLink($token);

        self::assertSame($result['userId'], $this->auth->userIdForBearer($result['sessionToken']));
        self::assertSame(
            ['id' => $result['userId'], 'email' => 'person@example.com'],
            $this->auth->userForBearer($result['sessionToken']),
        );
        self::assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM sessions')->fetchColumn());
    }

    public function test_magic_link_cannot_be_consumed_twice(): void
    {
        $this->auth->requestMagicLink('person@example.com');
        $token = $this->tokenFromLastUrl();
        $this->auth->consumeMagicLink($token);

        $this->expectException(RuntimeException::class);
        $this->auth->consumeMagicLink($token);
    }

    public function test_revoke_session_invalidates_bearer(): void
    {
        $this->auth->requestMagicLink('person@example.com');
        $session = $this->auth->consumeMagicLink($this->tokenFromLastUrl());

        $this->auth->revokeSession($session['sessionToken']);

        self::assertNull($this->auth->userIdForBearer($session['sessionToken']));
    }

    public function test_rejects_more_than_five_requests_per_email_in_fifteen_minutes(): void
    {
        for ($request = 0; $request < 5; $request++) {
            $this->auth->requestMagicLink('person@example.com');
        }

        $this->expectException(\Putaway\Auth\RateLimitExceeded::class);
        $this->auth->requestMagicLink('person@example.com');
    }

    private function tokenFromLastUrl(): string
    {
        self::assertNotNull($this->mailer->lastUrl);
        parse_str((string) parse_url($this->mailer->lastUrl, PHP_URL_QUERY), $query);
        return (string) $query['token'];
    }
}
