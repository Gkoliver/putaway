<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Auth\AuthService;
use Putaway\Auth\NullMailer;
use Putaway\Commands\CommandController;
use Putaway\Commands\CommandHandler;
use Putaway\Commands\Interpreter;
use Putaway\Commands\OpenAiClient;
use Putaway\Commands\ReceiptStore;
use Putaway\Households\HouseholdService;
use Putaway\Http\Request;

final class CommandControllerTest extends TestCase
{
    private PDO $pdo;
    private AuthService $auth;
    private CommandHandler $handler;

    protected function setUp(): void
    {
        $this->pdo = new PDO('sqlite::memory:');
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->exec(
            'CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, created_at TEXT);
             CREATE TABLE sessions (
                id TEXT PRIMARY KEY, user_id TEXT, token TEXT, expires_at TEXT, created_at TEXT
             );
             CREATE TABLE household_members (
                household_id TEXT, user_id TEXT, role TEXT,
                PRIMARY KEY (household_id, user_id)
             );
             CREATE TABLE locations (
                id TEXT PRIMARY KEY, household_id TEXT, parent_id TEXT NULL, name TEXT,
                archived_at TEXT NULL, created_at TEXT, updated_at TEXT
             );
             CREATE TABLE items (
                id TEXT PRIMARY KEY, household_id TEXT, name TEXT,
                UNIQUE (household_id, name)
             );
             CREATE TABLE stock_lots (
                id TEXT PRIMARY KEY, household_id TEXT, item_id TEXT, location_id TEXT,
                quantity INTEGER, put_away_count INTEGER, last_activity_at TEXT,
                UNIQUE (household_id, item_id, location_id)
             );
             CREATE TABLE command_receipts (
                id TEXT PRIMARY KEY, household_id TEXT, user_id TEXT, client_command_id TEXT,
                result_json TEXT, created_at TEXT,
                UNIQUE (household_id, user_id, client_command_id)
             );',
        );
        $this->pdo->exec(
            "INSERT INTO users VALUES ('member', 'm@example.com', 'Member', '2026-09-20');
             INSERT INTO sessions VALUES
                ('session', 'member', 'token', '2099-01-01 00:00:00', '2026-09-20');
             INSERT INTO household_members VALUES ('home', 'member', 'member');
             INSERT INTO locations VALUES
                ('cabinet', 'home', NULL, 'Cabinet', NULL, '2026-09-20', '2026-09-20');
             INSERT INTO items VALUES ('hats', 'home', 'Hats');
             INSERT INTO stock_lots VALUES
                ('lot', 'home', 'hats', 'cabinet', 1, 1, '2026-09-20');",
        );
        $this->auth = new AuthService(
            $this->pdo,
            new NullMailer(),
            'https://put-away.com',
            'noreply@put-away.com',
            2_592_000,
        );
        $this->handler = new CommandHandler(
            $this->pdo,
            new HouseholdService($this->pdo),
            new ReceiptStore($this->pdo),
        );
    }

    public function test_requires_bearer_and_accepts_expo_json_command(): void
    {
        $openAi = new OpenAiClient('test', static fn (): array => []);
        $controller = new CommandController(
            $this->handler,
            new Interpreter([$openAi, 'extract']),
            $openAi,
            $this->auth,
        );
        $body = [
            'householdId' => 'home',
            'clientCommandId' => 'command-1',
            'command' => [
                'intent' => 'find',
                'itemText' => 'hats',
                'quantity' => 1,
            ],
        ];

        $unauthorized = $controller->submit(Request::fake(
            'POST',
            '/api/commands',
            ['Content-Type' => 'application/json'],
            json_encode($body, JSON_THROW_ON_ERROR),
        ));
        self::assertSame(401, $unauthorized->status);

        $response = $controller->submit(Request::fake(
            'POST',
            '/api/commands',
            ['Authorization' => 'Bearer token', 'Content-Type' => 'application/json'],
            json_encode($body, JSON_THROW_ON_ERROR),
        ));
        self::assertSame(200, $response->status);
        self::assertSame('ok', $this->json($response->body)['type']);
    }

    public function test_audio_openai_failure_returns_voice_unavailable(): void
    {
        $openAi = new OpenAiClient('test', static function (): array {
            throw new RuntimeException('network down');
        });
        $controller = new CommandController(
            $this->handler,
            new Interpreter([$openAi, 'extract']),
            $openAi,
            $this->auth,
        );
        $response = $controller->submit(Request::fake(
            'POST',
            '/api/commands',
            ['Authorization' => 'Bearer token', 'Content-Type' => 'multipart/form-data'],
            form: ['householdId' => 'home', 'clientCommandId' => 'audio-1'],
            files: ['audio' => [
                'tmp_name' => '/tmp/clip.m4a',
                'name' => 'clip.m4a',
                'type' => 'audio/mp4',
                'error' => UPLOAD_ERR_OK,
                'size' => 10,
            ]],
        ));

        self::assertSame(200, $response->status);
        self::assertSame([
            'type' => 'error',
            'code' => 'voice_unavailable',
            'spoken' => 'Voice is unavailable — type it instead.',
        ], $this->json($response->body));
    }

    /** @return array<string, mixed> */
    private function json(string $body): array
    {
        return json_decode($body, true, flags: JSON_THROW_ON_ERROR);
    }
}
