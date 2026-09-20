<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Auth\AuthService;
use Putaway\Auth\NullMailer;
use Putaway\Http\Request;
use Putaway\Web\Csrf;

final class WebSecurityTest extends TestCase
{
    public function test_csrf_tokens_are_random_and_validate_against_cookie(): void
    {
        $csrf = new Csrf();
        $first = $csrf->generate();
        $second = $csrf->generate();

        self::assertNotSame($first, $second);
        self::assertTrue($csrf->validate($first, $first));
        self::assertFalse($csrf->validate($first, $second));
        self::assertFalse($csrf->validate(null, $first));
        self::assertFalse($csrf->validate($first, null));
    }

    public function test_request_reads_named_cookie_without_confusing_prefixes(): void
    {
        $request = Request::fake('GET', '/', [
            'Cookie' => 'other_putaway_session=wrong; putaway_session=right%20token; theme=light',
        ]);

        self::assertSame('right token', $request->cookie('putaway_session'));
        self::assertSame('light', $request->cookie('theme'));
        self::assertNull($request->cookie('missing'));
    }

    public function test_auth_service_resolves_user_from_session_cookie_token(): void
    {
        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec(
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
            INSERT INTO users (id, email, name, created_at)
                VALUES ("user-1", "person@example.com", "Person", "2026-09-20 12:00:00");
            INSERT INTO sessions (id, user_id, token, expires_at, created_at)
                VALUES ("session-1", "user-1", "cookie-token", "2099-01-01 00:00:00", "2026-09-20 12:00:00");',
        );
        $auth = new AuthService(
            $pdo,
            new NullMailer(),
            'https://put-away.com',
            'noreply@put-away.com',
            2_592_000,
        );

        self::assertSame('user-1', $auth->userIdForCookie('cookie-token'));
        self::assertNull($auth->userIdForCookie('missing'));
        self::assertNull($auth->userIdForCookie(null));
    }
}
