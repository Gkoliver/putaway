<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Auth\AuthService;
use Putaway\Auth\NullMailer;
use Putaway\Households\HouseholdService;
use Putaway\Http\Request;
use Putaway\Inventory\InventoryController;
use Putaway\Inventory\InventoryService;
use Putaway\Inventory\LocationService;

final class InventoryLockRecordingStatement extends PDOStatement
{
    public function execute(?array $params = null): bool
    {
        return true;
    }

    public function fetch(
        int $mode = PDO::FETCH_DEFAULT,
        int $cursorOrientation = PDO::FETCH_ORI_NEXT,
        int $cursorOffset = 0,
    ): mixed {
        return ['quantity' => 1];
    }
}

final class InventoryLockRecordingPdo extends PDO
{
    public string $lastSql = '';

    public function __construct(private readonly string $driver)
    {
    }

    public function getAttribute(int $attribute): mixed
    {
        return $attribute === PDO::ATTR_DRIVER_NAME ? $this->driver : null;
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $this->lastSql = $query;
        return new InventoryLockRecordingStatement();
    }
}

final class InventoryServiceTest extends TestCase
{
    private PDO $pdo;
    private InventoryService $inventory;
    private InventoryController $controller;

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
            CREATE TABLE locations (
                id TEXT PRIMARY KEY,
                household_id TEXT NOT NULL,
                parent_id TEXT NULL,
                name TEXT NOT NULL,
                archived_at TEXT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE items (
                id TEXT PRIMARY KEY,
                household_id TEXT NOT NULL,
                name TEXT NOT NULL,
                UNIQUE (household_id, name)
            );
            CREATE TABLE stock_lots (
                id TEXT PRIMARY KEY,
                household_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                location_id TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                put_away_count INTEGER NOT NULL,
                last_activity_at TEXT NOT NULL,
                UNIQUE (household_id, item_id, location_id)
            );',
        );
        $this->pdo->exec(
            "INSERT INTO users (id, email, name, created_at) VALUES
                ('member', 'member@example.com', 'Member', '2026-09-20 12:00:00'),
                ('stranger', 'stranger@example.com', 'Stranger', '2026-09-20 12:00:00');
             INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES
                ('session-member', 'member', 'token-member', '2099-01-01 00:00:00', '2026-09-20 12:00:00');
             INSERT INTO households (id, name, created_at, updated_at)
                VALUES ('home', 'Home', '2026-09-20 12:00:00', '2026-09-20 12:00:00');
             INSERT INTO household_members (household_id, user_id, role)
                VALUES ('home', 'member', 'member');
             INSERT INTO locations
                (id, household_id, parent_id, name, archived_at, created_at, updated_at) VALUES
                ('basement', 'home', NULL, 'Basement', NULL, '2026-09-20 12:00:00', '2026-09-20 12:00:00'),
                ('cabinet', 'home', 'basement', 'Cabinet', NULL, '2026-09-20 12:00:00', '2026-09-20 12:00:00');
             INSERT INTO items (id, household_id, name)
                VALUES ('hats', 'home', 'Hats');
             INSERT INTO stock_lots
                (id, household_id, item_id, location_id, quantity, put_away_count, last_activity_at)
                VALUES ('lot-hats', 'home', 'hats', 'cabinet', 8, 1, '2026-09-20 12:00:00');",
        );

        $households = new HouseholdService($this->pdo);
        $locations = new LocationService($this->pdo, $households);
        $this->inventory = new InventoryService($this->pdo, $households, $locations);
        $auth = new AuthService(
            $this->pdo,
            new NullMailer(),
            'https://put-away.com',
            'noreply@put-away.com',
            2_592_000,
        );
        $this->controller = new InventoryController($this->inventory, $auth);
    }

    public function test_member_lists_inventory_in_expo_shape(): void
    {
        self::assertSame([[
            'itemId' => 'hats',
            'itemName' => 'Hats',
            'locationId' => 'cabinet',
            'pathLabel' => 'Basement → Cabinet',
            'quantity' => 8,
        ]], $this->inventory->listInventory('member', 'home'));
    }

    public function test_list_and_edit_require_membership(): void
    {
        self::assertSame(
            ['ok' => false, 'code' => 'forbidden'],
            $this->inventory->listInventory('stranger', 'home'),
        );
        self::assertSame(
            ['ok' => false, 'code' => 'forbidden', 'spoken' => 'You cannot edit inventory.'],
            $this->inventory->editLot(
                'stranger',
                'home',
                'hats',
                'cabinet',
                'Caps',
                2,
                ['Basement', 'Cabinet'],
            ),
        );
    }

    public function test_patch_renames_item_and_sets_quantity_in_place(): void
    {
        $response = $this->controller->editInventory(
            $this->request('PATCH', [
                'itemId' => 'hats',
                'locationId' => 'cabinet',
                'name' => ' winter hats ',
                'quantity' => 5,
                'locationPath' => ['Basement', 'Cabinet'],
            ]),
            'home',
        );

        self::assertSame(200, $response->status);
        self::assertSame([
            'ok' => true,
            'itemId' => 'hats',
            'itemName' => 'Winter Hats',
            'locationId' => 'cabinet',
            'pathLabel' => 'Basement → Cabinet',
            'quantity' => 5,
        ], $this->json($response->body));
        self::assertSame('Winter Hats', $this->pdo->query(
            "SELECT name FROM items WHERE id = 'hats'",
        )->fetchColumn());
    }

    public function test_patch_moves_and_merges_lot_into_created_location_path(): void
    {
        $this->pdo->exec(
            "INSERT INTO locations
                (id, household_id, parent_id, name, archived_at, created_at, updated_at)
                VALUES ('attic', 'home', NULL, 'Attic', NULL, '2026-09-20 12:00:00', '2026-09-20 12:00:00');
             INSERT INTO stock_lots
                (id, household_id, item_id, location_id, quantity, put_away_count, last_activity_at)
                VALUES ('lot-attic', 'home', 'hats', 'attic', 2, 1, '2026-09-20 12:00:00');",
        );

        $result = $this->inventory->editLot(
            'member',
            'home',
            'hats',
            'cabinet',
            'hats',
            8,
            ['Attic'],
        );

        self::assertSame(true, $result['ok']);
        self::assertSame(10, $result['quantity']);
        self::assertSame(0, $this->quantityAt('cabinet'));
        self::assertSame(10, $this->quantityAt('attic'));
    }

    public function test_edit_lot_uses_mysql_row_locks_with_sqlite_transaction_fallback(): void
    {
        $mysql = new InventoryLockRecordingPdo('mysql');
        $mysqlHouseholds = new HouseholdService($mysql);
        $mysqlInventory = new InventoryService(
            $mysql,
            $mysqlHouseholds,
            new LocationService($mysql, $mysqlHouseholds),
        );
        $loadLot = new ReflectionMethod($mysqlInventory, 'loadLot');
        $loadLot->invoke($mysqlInventory, 'home', 'hats', 'cabinet', true);
        self::assertStringEndsWith('FOR UPDATE', trim($mysql->lastSql));

        $sqlite = new InventoryLockRecordingPdo('sqlite');
        $sqliteHouseholds = new HouseholdService($sqlite);
        $sqliteInventory = new InventoryService(
            $sqlite,
            $sqliteHouseholds,
            new LocationService($sqlite, $sqliteHouseholds),
        );
        $loadLot->invoke($sqliteInventory, 'home', 'hats', 'cabinet', true);
        self::assertStringNotContainsString('FOR UPDATE', $sqlite->lastSql);
    }

    public function test_controller_validates_body_and_maps_domain_errors(): void
    {
        $invalid = $this->controller->editInventory(
            $this->request('PATCH', ['itemId' => 'hats']),
            'home',
        );
        self::assertSame(400, $invalid->status);
        self::assertSame(
            ['error' => 'invalid', 'spoken' => 'Could not save.'],
            $this->json($invalid->body),
        );

        $missing = $this->controller->editInventory(
            $this->request('PATCH', [
                'itemId' => 'missing',
                'locationId' => 'cabinet',
                'name' => 'Hats',
                'quantity' => 1,
                'locationPath' => ['Basement', 'Cabinet'],
            ]),
            'home',
        );
        self::assertSame(404, $missing->status);
        self::assertSame('unknown_item', $this->json($missing->body)['error']);
    }

    private function quantityAt(string $locationId): int
    {
        $statement = $this->pdo->prepare(
            'SELECT quantity FROM stock_lots WHERE item_id = :item_id AND location_id = :location_id',
        );
        $statement->execute(['item_id' => 'hats', 'location_id' => $locationId]);
        return (int) $statement->fetchColumn();
    }

    /** @param array<string, mixed>|null $body */
    private function request(
        string $method,
        ?array $body = null,
        string $token = 'token-member',
    ): Request {
        return Request::fake(
            $method,
            '/api/households/home/inventory',
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
