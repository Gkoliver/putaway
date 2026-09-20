<?php
declare(strict_types=1);

namespace Putaway\Inventory;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use PDOException;
use Putaway\Auth\Uuid;
use Putaway\Households\HouseholdService;
use Throwable;

final class InventoryService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly HouseholdService $households,
        private readonly LocationService $locations,
    ) {
    }

    /**
     * @return list<array{
     *     itemId: string,
     *     itemName: string,
     *     locationId: string,
     *     pathLabel: string,
     *     quantity: int
     * }>|array{ok: false, code: 'forbidden'}
     */
    public function listInventory(string $userId, string $householdId): array
    {
        if ($this->households->requireMembership($userId, $householdId) === null) {
            return ['ok' => false, 'code' => 'forbidden'];
        }

        $statement = $this->pdo->prepare(
            'SELECT
                items.id AS item_id,
                items.name AS item_name,
                stock_lots.location_id,
                stock_lots.quantity
             FROM stock_lots
             INNER JOIN items ON items.id = stock_lots.item_id
             INNER JOIN locations ON locations.id = stock_lots.location_id
             WHERE stock_lots.household_id = :lot_household_id
               AND items.household_id = :item_household_id
               AND locations.household_id = :location_household_id
               AND locations.archived_at IS NULL',
        );
        $statement->execute([
            'lot_household_id' => $householdId,
            'item_household_id' => $householdId,
            'location_household_id' => $householdId,
        ]);

        $pathLabels = $this->locationPathLabels($userId, $householdId);
        $result = [];
        foreach ($statement->fetchAll() as $row) {
            $locationId = (string) $row['location_id'];
            $result[] = [
                'itemId' => (string) $row['item_id'],
                'itemName' => (string) $row['item_name'],
                'locationId' => $locationId,
                'pathLabel' => $pathLabels[$locationId] ?? '',
                'quantity' => (int) $row['quantity'],
            ];
        }

        usort($result, static function (array $left, array $right): int {
            $byItem = strcasecmp($left['itemName'], $right['itemName']);
            return $byItem !== 0 ? $byItem : strcasecmp($left['pathLabel'], $right['pathLabel']);
        });
        return $result;
    }

    /**
     * @param list<string> $locationPath
     * @return array{
     *     ok: true,
     *     itemId: string,
     *     itemName: string,
     *     locationId: string,
     *     pathLabel: string,
     *     quantity: int
     * }|array{ok: false, code: string, spoken: string}
     */
    public function editLot(
        string $userId,
        string $householdId,
        string $itemId,
        string $locationId,
        string $name,
        int $quantity,
        array $locationPath,
    ): array {
        if ($this->households->requireMembership($userId, $householdId) === null) {
            return $this->failure('forbidden', 'You cannot edit inventory.');
        }

        $itemName = $this->readableName($name);
        $locationPath = array_values(array_filter(
            array_map(static fn (string $segment): string => trim($segment), $locationPath),
            static fn (string $segment): bool => $segment !== '',
        ));
        if ($itemName === '') {
            return $this->failure('invalid', 'Type an item name.');
        }
        if ($quantity < 0) {
            return $this->failure('invalid', 'Quantity must be zero or more.');
        }
        if ($locationPath === []) {
            return $this->failure('invalid', 'Type a location.');
        }

        $this->pdo->beginTransaction();
        try {
            $item = $this->loadItem($householdId, $itemId);
            $source = $this->loadLot($householdId, $itemId, $locationId);
            if ($item === null || $source === null) {
                $this->pdo->rollBack();
                return $this->failure('unknown_item', "I don't have that item yet.");
            }

            if (strcasecmp($item['name'], $itemName) !== 0) {
                if ($this->hasItemName($householdId, $itemName, $itemId)) {
                    $this->pdo->rollBack();
                    return $this->failure(
                        'duplicate_name',
                        'You already have an item called ' . $itemName . '.',
                    );
                }
                $statement = $this->pdo->prepare(
                    'UPDATE items SET name = :name WHERE id = :id AND household_id = :household_id',
                );
                $statement->execute([
                    'name' => $itemName,
                    'id' => $itemId,
                    'household_id' => $householdId,
                ]);
            }

            $destination = $this->resolveLocationPath($householdId, $locationPath);
            $destinationId = $destination['locationId'];
            $destinationQuantity = $quantity;
            if ($destinationId !== $locationId) {
                $destinationLot = $this->loadLot($householdId, $itemId, $destinationId);
                $destinationQuantity += $destinationLot['quantity'] ?? 0;
                if ($destinationQuantity > 0 || $destinationLot !== null) {
                    $this->setLotQuantity(
                        $householdId,
                        $itemId,
                        $destinationId,
                        $destinationQuantity,
                    );
                }
                $this->setLotQuantity($householdId, $itemId, $locationId, 0);
            } else {
                $this->setLotQuantity($householdId, $itemId, $locationId, $quantity);
            }

            $this->pdo->commit();
            return [
                'ok' => true,
                'itemId' => $itemId,
                'itemName' => $itemName,
                'locationId' => $destinationId,
                'pathLabel' => $destination['pathLabel'],
                'quantity' => $destinationQuantity,
            ];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ($this->isUniqueViolation($error)) {
                return $this->failure(
                    'duplicate_name',
                    'You already have an item called ' . $itemName . '.',
                );
            }
            throw $error;
        }
    }

    /** @return array<string, string> */
    private function locationPathLabels(string $userId, string $householdId): array
    {
        $rows = $this->locations->listLocations($userId, $householdId);
        $labels = [];
        foreach ($rows as $row) {
            if (isset($row['id'], $row['pathLabel'])) {
                $labels[(string) $row['id']] = (string) $row['pathLabel'];
            }
        }
        return $labels;
    }

    /** @return array{name: string}|null */
    private function loadItem(string $householdId, string $itemId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT name FROM items WHERE id = :id AND household_id = :household_id',
        );
        $statement->execute(['id' => $itemId, 'household_id' => $householdId]);
        $row = $statement->fetch();
        return is_array($row) ? ['name' => (string) $row['name']] : null;
    }

    /** @return array{quantity: int}|null */
    private function loadLot(string $householdId, string $itemId, string $locationId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT quantity
             FROM stock_lots
             WHERE household_id = :household_id
               AND item_id = :item_id
               AND location_id = :location_id',
        );
        $statement->execute([
            'household_id' => $householdId,
            'item_id' => $itemId,
            'location_id' => $locationId,
        ]);
        $row = $statement->fetch();
        return is_array($row) ? ['quantity' => (int) $row['quantity']] : null;
    }

    private function hasItemName(string $householdId, string $name, string $exceptId): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM items
             WHERE household_id = :household_id
               AND LOWER(name) = LOWER(:name)
               AND id <> :except_id',
        );
        $statement->execute([
            'household_id' => $householdId,
            'name' => $name,
            'except_id' => $exceptId,
        ]);
        return $statement->fetchColumn() !== false;
    }

    /**
     * @param list<string> $segments
     * @return array{locationId: string, pathLabel: string}
     */
    private function resolveLocationPath(string $householdId, array $segments): array
    {
        $parentId = null;
        $locationId = '';
        $names = [];

        foreach ($segments as $segment) {
            $parentWhere = $parentId === null
                ? 'parent_id IS NULL'
                : 'parent_id = :parent_id';
            $statement = $this->pdo->prepare(
                'SELECT id, name
                 FROM locations
                 WHERE household_id = :household_id
                   AND ' . $parentWhere . '
                   AND archived_at IS NULL
                   AND LOWER(name) = LOWER(:name)',
            );
            $parameters = ['household_id' => $householdId, 'name' => $segment];
            if ($parentId !== null) {
                $parameters['parent_id'] = $parentId;
            }
            $statement->execute($parameters);
            $row = $statement->fetch();

            if (is_array($row)) {
                $locationId = (string) $row['id'];
                $locationName = (string) $row['name'];
            } else {
                $locationId = Uuid::v4();
                $locationName = $this->locationName($segment);
                $insert = $this->pdo->prepare(
                    'INSERT INTO locations
                        (id, household_id, parent_id, name, archived_at, created_at, updated_at)
                     VALUES
                        (:id, :household_id, :parent_id, :name, NULL, :created_at, :updated_at)',
                );
                $now = $this->now();
                $insert->execute([
                    'id' => $locationId,
                    'household_id' => $householdId,
                    'parent_id' => $parentId,
                    'name' => $locationName,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            $names[] = $locationName;
            $parentId = $locationId;
        }

        return ['locationId' => $locationId, 'pathLabel' => implode(' → ', $names)];
    }

    private function setLotQuantity(
        string $householdId,
        string $itemId,
        string $locationId,
        int $quantity,
    ): void {
        $existing = $this->loadLot($householdId, $itemId, $locationId);
        if ($existing !== null) {
            $statement = $this->pdo->prepare(
                'UPDATE stock_lots
                 SET quantity = :quantity, last_activity_at = :last_activity_at
                 WHERE household_id = :household_id
                   AND item_id = :item_id
                   AND location_id = :location_id',
            );
            $statement->execute([
                'quantity' => $quantity,
                'last_activity_at' => $this->now(),
                'household_id' => $householdId,
                'item_id' => $itemId,
                'location_id' => $locationId,
            ]);
            return;
        }

        $statement = $this->pdo->prepare(
            'INSERT INTO stock_lots
                (id, household_id, item_id, location_id, quantity, put_away_count, last_activity_at)
             VALUES
                (:id, :household_id, :item_id, :location_id, :quantity, :put_away_count, :last_activity_at)',
        );
        $statement->execute([
            'id' => Uuid::v4(),
            'household_id' => $householdId,
            'item_id' => $itemId,
            'location_id' => $locationId,
            'quantity' => $quantity,
            'put_away_count' => $quantity > 0 ? 1 : 0,
            'last_activity_at' => $this->now(),
        ]);
    }

    private function readableName(string $name): string
    {
        $words = preg_split('/\s+/', trim($name)) ?: [];
        return implode(' ', array_map(
            static fn (string $word): string => ucfirst(strtolower($word)),
            $words,
        ));
    }

    private function locationName(string $name): string
    {
        $words = preg_split('/\s+/', trim($name)) ?: [];
        foreach ($words as $index => $word) {
            if (preg_match('/[A-Z]/', $word) === 1) {
                continue;
            }
            $lower = strtolower($word);
            $words[$index] = $index === 0 || strlen($lower) === 1
                ? ucfirst($lower)
                : $lower;
        }
        return implode(' ', $words);
    }

    private function isUniqueViolation(Throwable $error): bool
    {
        $current = $error;
        while ($current !== null) {
            if ($current instanceof PDOException) {
                $sqlState = (string) ($current->errorInfo[0] ?? $current->getCode());
                if ($sqlState === '23000' || $sqlState === '23505') {
                    return true;
                }
            }
            $current = $current->getPrevious();
        }
        return false;
    }

    /** @return array{ok: false, code: string, spoken: string} */
    private function failure(string $code, string $spoken): array
    {
        return ['ok' => false, 'code' => $code, 'spoken' => $spoken];
    }

    private function now(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }
}
