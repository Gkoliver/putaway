<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Commands\CommandHandler;
use Putaway\Commands\ReceiptStore;
use Putaway\Households\HouseholdService;

final class CommandHandlerTest extends TestCase
{
    private PDO $pdo;
    private CommandHandler $handler;

    protected function setUp(): void
    {
        $this->pdo = new PDO('sqlite::memory:');
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->exec(
            'CREATE TABLE household_members (
                household_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
                PRIMARY KEY (household_id, user_id)
            );
            CREATE TABLE locations (
                id TEXT PRIMARY KEY, household_id TEXT NOT NULL, parent_id TEXT NULL,
                name TEXT NOT NULL, archived_at TEXT NULL
            );
            CREATE TABLE items (
                id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL,
                UNIQUE (household_id, name)
            );
            CREATE TABLE stock_lots (
                id TEXT PRIMARY KEY, household_id TEXT NOT NULL, item_id TEXT NOT NULL,
                location_id TEXT NOT NULL, quantity INTEGER NOT NULL,
                put_away_count INTEGER NOT NULL, last_activity_at TEXT NOT NULL,
                UNIQUE (household_id, item_id, location_id)
            );
            CREATE TABLE command_receipts (
                id TEXT PRIMARY KEY, household_id TEXT NOT NULL, user_id TEXT NOT NULL,
                client_command_id TEXT NOT NULL, result_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE (household_id, user_id, client_command_id)
            );',
        );
        $this->pdo->exec(
            "INSERT INTO household_members VALUES ('home', 'member', 'member');
             INSERT INTO locations VALUES ('basement', 'home', NULL, 'Basement', NULL);
             INSERT INTO locations VALUES ('cabinet', 'home', 'basement', 'Cabinet', NULL);
             INSERT INTO items VALUES ('hats', 'home', 'Hats');
             INSERT INTO items VALUES ('paper', 'home', 'Paper Towels');
             INSERT INTO stock_lots VALUES
                ('lot-hats', 'home', 'hats', 'cabinet', 8, 1, '2026-09-20 12:00:00');",
        );
        $this->handler = new CommandHandler(
            $this->pdo,
            new HouseholdService($this->pdo),
            new ReceiptStore($this->pdo),
        );
    }

    public function test_put_away_increments_lot_and_take_out_decrements_it(): void
    {
        $put = $this->handler->handle('member', 'home', 'put-1', [
            'intent' => 'put_away',
            'itemText' => 'hats',
            'quantity' => 2,
            'locationPath' => ['basement', 'cabinet'],
        ]);
        self::assertSame('ok', $put['type']);
        self::assertSame(10, $put['lots'][0]['quantity']);

        $take = $this->handler->handle('member', 'home', 'take-1', [
            'intent' => 'take_out',
            'itemText' => 'hats',
            'quantity' => 3,
        ]);
        self::assertSame('ok', $take['type']);
        self::assertSame(7, $take['lots'][0]['quantity']);
    }

    public function test_receipt_replays_without_applying_command_twice(): void
    {
        $command = [
            'intent' => 'put_away',
            'itemText' => 'hats',
            'quantity' => 2,
            'locationPath' => ['basement', 'cabinet'],
        ];
        $first = $this->handler->handle('member', 'home', 'same-id', $command);
        $second = $this->handler->handle('member', 'home', 'same-id', $command);

        self::assertSame($first, $second);
        self::assertSame(10, (int) $this->pdo->query(
            "SELECT quantity FROM stock_lots WHERE id = 'lot-hats'",
        )->fetchColumn());
    }

    public function test_unconfirmed_batch_returns_confirm_batch_clarification(): void
    {
        $result = $this->handler->handle('member', 'home', 'batch-1', [
            'intent' => 'put_away_batch',
            'locationPath' => ['basement', 'cabinet'],
            'items' => [
                ['itemText' => 'soap', 'quantity' => 1],
                ['itemText' => 'sponges', 'quantity' => 2],
            ],
        ]);

        self::assertSame('clarification', $result['type']);
        self::assertSame('confirm_batch', $result['clarification']['type']);
        self::assertTrue($result['command']['confirmed']);
    }

    public function test_suggests_catalog_items_when_find_misses(): void
    {
        $calls = [];
        $handler = new CommandHandler(
            $this->pdo,
            new HouseholdService($this->pdo),
            new ReceiptStore($this->pdo),
            static function (string $spoken, array $catalog) use (&$calls): array {
                $calls[] = [$spoken, $catalog];
                return [['itemId' => 'paper', 'name' => 'Paper Towels']];
            },
        );
        $result = $handler->handle('member', 'home', 'find-1', [
            'intent' => 'find',
            'itemText' => 'kitchen roll',
            'quantity' => 1,
        ]);

        self::assertSame('clarification', $result['type']);
        self::assertSame('which_item', $result['clarification']['type']);
        self::assertSame('paper', $result['clarification']['candidates'][0]['itemId']);
        self::assertSame('kitchen roll', $calls[0][0]);
    }
}
