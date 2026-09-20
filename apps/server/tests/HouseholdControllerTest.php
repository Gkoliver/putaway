<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Auth\AuthService;
use Putaway\Auth\NullMailer;
use Putaway\Households\HouseholdController;
use Putaway\Households\HouseholdService;
use Putaway\Http\Request;

final class HouseholdControllerTest extends TestCase
{
    private HouseholdController $controller;

    protected function setUp(): void
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
            CREATE TABLE households (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE household_members (
                household_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                PRIMARY KEY (household_id, user_id)
            );
            CREATE TABLE invites (
                id TEXT PRIMARY KEY,
                household_id TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                accepted_at TEXT NULL
            );',
        );
        $pdo->exec(
            "INSERT INTO users (id, email, name, created_at) VALUES
                ('user-a', 'owner@example.com', 'Owner', '2026-09-20 12:00:00'),
                ('user-b', 'member@example.com', 'Member', '2026-09-20 12:00:00');
             INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES
                ('session-a', 'user-a', 'token-a', '2099-01-01 00:00:00', '2026-09-20 12:00:00'),
                ('session-b', 'user-b', 'token-b', '2099-01-01 00:00:00', '2026-09-20 12:00:00');",
        );
        $auth = new AuthService(
            $pdo,
            new NullMailer(),
            'https://put-away.com',
            'noreply@put-away.com',
            2_592_000,
        );
        $this->controller = new HouseholdController(new HouseholdService($pdo), $auth);
    }

    public function test_create_list_invite_and_accept_flow_uses_mobile_json_shapes(): void
    {
        $created = $this->controller->createHousehold(
            $this->request('POST', '/api/households', 'token-a', ['name' => 'Oliver house']),
        );
        self::assertSame(201, $created->status);
        $household = $this->json($created->body);
        self::assertSame('owner', $household['role']);

        $listed = $this->controller->listHouseholds(
            $this->request('GET', '/api/households', 'token-a'),
        );
        self::assertSame([[
            'householdId' => $household['householdId'],
            'name' => 'Oliver house',
            'role' => 'owner',
        ]], $this->json($listed->body));

        $invited = $this->controller->createInvite(
            $this->request('POST', '/api/households/invites', 'token-a', [
                'householdId' => $household['householdId'],
                'email' => 'member@example.com',
                'role' => 'member',
            ]),
        );
        self::assertSame(201, $invited->status);
        $invite = $this->json($invited->body);
        self::assertArrayHasKey('token', $invite);

        $accepted = $this->controller->acceptInvite(
            $this->request('POST', '/api/households/invites/accept', 'token-b', [
                'token' => $invite['token'],
            ]),
        );
        self::assertSame(200, $accepted->status);
        self::assertSame(
            ['householdId' => $household['householdId']],
            $this->json($accepted->body),
        );
    }

    public function test_household_endpoints_require_authentication(): void
    {
        $response = $this->controller->listHouseholds(Request::fake('GET', '/api/households'));

        self::assertSame(401, $response->status);
        self::assertSame(['error' => 'unauthorized'], $this->json($response->body));
    }

    /** @param array<string, mixed>|null $body */
    private function request(string $method, string $path, string $token, ?array $body = null): Request
    {
        return Request::fake(
            $method,
            $path,
            ['Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json'],
            $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR),
        );
    }

    /** @return array<mixed> */
    private function json(string $body): array
    {
        return json_decode($body, true, flags: JSON_THROW_ON_ERROR);
    }
}
