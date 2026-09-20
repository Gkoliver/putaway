<?php
declare(strict_types=1);

namespace Putaway\Commands;

use Closure;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use PDOException;
use Putaway\Auth\Uuid;
use Putaway\Households\HouseholdService;
use Throwable;

final class CommandHandler
{
    private readonly ?Closure $suggestItems;

    /** @param null|callable(string, list<array{itemId: string, name: string}>): list<array{itemId: string, name: string}> $suggestItems */
    public function __construct(
        private readonly PDO $pdo,
        private readonly HouseholdService $households,
        private readonly ReceiptStore $receipts,
        ?callable $suggestItems = null,
    ) {
        $this->suggestItems = $suggestItems === null ? null : Closure::fromCallable($suggestItems);
    }

    /** @param array<string, mixed> $command @return array<string, mixed> */
    public function handle(
        string $userId,
        string $householdId,
        string $clientCommandId,
        array $command,
    ): array {
        $preflight = $this->preflight($userId, $householdId, $clientCommandId);
        if ($preflight !== null) {
            return $preflight;
        }

        $this->pdo->beginTransaction();
        try {
            $receipt = $this->receipts->find($householdId, $userId, $clientCommandId);
            if ($receipt !== null) {
                $this->pdo->commit();
                return $receipt;
            }
            $result = $this->apply($householdId, $command);
            $this->receipts->save($householdId, $userId, $clientCommandId, $result);
            $this->pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ($this->isUniqueViolation($error)) {
                $receipt = $this->receipts->find($householdId, $userId, $clientCommandId);
                if ($receipt !== null) {
                    return $receipt;
                }
            }
            throw $error;
        }
    }

    /** @return array<string, mixed>|null */
    public function preflight(
        string $userId,
        string $householdId,
        string $clientCommandId,
    ): ?array {
        if ($this->households->requireMembership($userId, $householdId) === null) {
            return $this->error('forbidden', "You don't have access to that household.");
        }
        return $this->receipts->find($householdId, $userId, $clientCommandId);
    }

    /** @param array<string, mixed> $command @return array<string, mixed> */
    private function apply(string $householdId, array $command): array
    {
        $intent = $command['intent'] ?? null;
        if ($intent === 'put_away_batch') {
            return $this->batch($householdId, $command);
        }
        if (!in_array($intent, ['put_away', 'take_out', 'find', 'find_usual'], true)) {
            return $this->error('not_caught', "I didn't catch that.");
        }
        $itemText = is_string($command['itemText'] ?? null) ? trim($command['itemText']) : '';
        $quantity = is_int($command['quantity'] ?? null) ? $command['quantity'] : 1;
        if ($itemText === '' || $quantity < 1) {
            return $this->error('not_caught', "I didn't catch that.");
        }

        $item = $this->resolveCommandItem(
            $householdId,
            $itemText,
            $intent === 'put_away',
            $command,
        );
        if (($item['type'] ?? null) !== 'resolved') {
            return $item;
        }

        if ($intent === 'put_away') {
            if (is_string($command['locationId'] ?? null)) {
                $location = $this->resolveLocationId($householdId, $command['locationId']);
                if (($location['type'] ?? null) === 'error') {
                    return $location;
                }
            } else {
                $path = $this->stringList($command['locationPath'] ?? null);
                if ($path === []) {
                    return $this->error('unknown_location', "I don't have a place called that place.");
                }
                $location = $this->resolveLocation($householdId, $path, true);
            }
            $quantityNow = $this->changeLot(
                $householdId,
                $item['itemId'],
                $location['locationId'],
                $quantity,
                true,
            );
            return $this->ok(
                $householdId,
                $item,
                "Added {$quantity} {$item['name']} to {$location['pathLabel']}. Now {$quantityNow}.",
            );
        }

        $lots = $this->lots($householdId, $item['itemId']);
        if ($intent === 'find' || $intent === 'find_usual') {
            return $this->findOutcome($item, $lots, $intent);
        }

        if (is_string($command['locationId'] ?? null)) {
            $location = $this->resolveLocationId($householdId, $command['locationId']);
            if (($location['type'] ?? null) === 'error') {
                return $location;
            }
            $target = $this->lotAt($lots, $location['locationId']) ?? [
                'locationId' => $location['locationId'],
                'pathLabel' => $location['pathLabel'],
                'quantity' => 0,
                'putAwayCount' => 0,
                'lastActivityAt' => '',
            ];
        } elseif (($requestedPath = $this->stringList($command['locationPath'] ?? null)) !== []) {
            $location = $this->resolveLocation($householdId, $requestedPath, false);
            if (($location['type'] ?? null) === 'error') {
                return $location;
            }
            $target = $this->lotAt($lots, $location['locationId']);
        } else {
            $inStock = array_values(array_filter($lots, static fn (array $lot): bool => $lot['quantity'] > 0));
            if (count($inStock) > 1) {
                $candidates = array_map(static fn (array $lot): array => [
                    'locationId' => $lot['locationId'],
                    'pathLabel' => $lot['pathLabel'],
                    'quantity' => $lot['quantity'],
                ], $inStock);
                return [
                    'type' => 'clarification',
                    'spoken' => implode(' or ', array_map(
                        static fn (array $lot): string => "{$lot['pathLabel']} ({$lot['quantity']})",
                        $candidates,
                    )) . '?',
                    'clarification' => ['type' => 'which_location', 'candidates' => $candidates],
                    'command' => $command,
                ];
            }
            $target = $inStock[0] ?? $this->usualLot($lots);
        }
        if ($target === null) {
            return $this->error('unknown_location', "I don't have a place called that place.");
        }
        $previous = $target['quantity'];
        $now = $this->changeLot(
            $householdId,
            $item['itemId'],
            $target['locationId'],
            -$quantity,
            false,
        );
        $spoken = $quantity > $previous
            ? "Only {$previous} left in {$target['pathLabel']}. Marked 0."
            : "Took {$quantity} {$item['name']} from {$target['pathLabel']}. Now {$now}.";
        return $this->ok($householdId, $item, $spoken);
    }

    /** @param array<string, mixed> $command @return array<string, mixed> */
    private function batch(string $householdId, array $command): array
    {
        $path = $this->stringList($command['locationPath'] ?? null);
        $items = is_array($command['items'] ?? null) ? $command['items'] : [];
        if (($command['confirmed'] ?? false) !== true) {
            $pathLabel = $this->pathLabel($path);
            $confirmed = $command;
            $confirmed['confirmed'] = true;
            return [
                'type' => 'clarification',
                'spoken' => "Add these items to {$pathLabel}?",
                'clarification' => [
                    'type' => 'confirm_batch',
                    'locationPath' => $path,
                    'pathLabel' => $pathLabel,
                    'items' => $items,
                ],
                'command' => $confirmed,
            ];
        }
        if ($path === [] || count($items) < 2) {
            return $this->error('not_caught', "I didn't catch that.");
        }
        $location = $this->resolveLocation($householdId, $path, true);
        $lastItem = null;
        $lines = [];
        foreach ($items as $line) {
            if (!is_array($line) || !is_string($line['itemText'] ?? null)) {
                return $this->error('not_caught', "I didn't catch that.");
            }
            $quantity = is_int($line['quantity'] ?? null) ? $line['quantity'] : 1;
            if ($quantity < 1) {
                return $this->error('not_caught', "I didn't catch that.");
            }
            $item = $this->resolveItem($householdId, trim($line['itemText']), true);
            if (($item['type'] ?? null) !== 'resolved') {
                return $item;
            }
            $now = $this->changeLot(
                $householdId,
                $item['itemId'],
                $location['locationId'],
                $quantity,
                true,
            );
            $lines[] = "{$quantity} {$item['name']} (now {$now})";
            $lastItem = $item;
        }
        return $this->ok(
            $householdId,
            $lastItem,
            "Added to {$location['pathLabel']}: " . implode('; ', $lines) . '.',
        );
    }

    /** @return array<string, mixed> */
    private function resolveItem(string $householdId, string $itemText, bool $create): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, name FROM items WHERE household_id = :household_id ORDER BY name',
        );
        $statement->execute(['household_id' => $householdId]);
        $catalog = array_map(static fn (array $row): array => [
            'itemId' => (string) $row['id'],
            'name' => (string) $row['name'],
        ], $statement->fetchAll());
        $matches = array_values(array_filter($catalog, static fn (array $item): bool =>
            strcasecmp($item['name'], $itemText) === 0
            || strcasecmp(rtrim($item['name'], 's'), rtrim($itemText, 's')) === 0
        ));
        if (count($matches) === 1) {
            return ['type' => 'resolved'] + $matches[0];
        }
        if ($matches !== []) {
            return $this->whichItem($itemText, $matches);
        }
        if (!$create) {
            if ($this->suggestItems !== null && $catalog !== []) {
                try {
                    $suggested = ($this->suggestItems)($itemText, $catalog);
                    $ids = array_column($catalog, null, 'itemId');
                    $valid = [];
                    foreach ($suggested as $candidate) {
                        $id = is_array($candidate) ? ($candidate['itemId'] ?? null) : null;
                        if (is_string($id) && isset($ids[$id]) && !isset($valid[$id])) {
                            $valid[$id] = $ids[$id];
                        }
                    }
                    if ($valid !== []) {
                        return $this->whichItem($itemText, array_values($valid));
                    }
                } catch (Throwable) {
                    // Suggestions are optional; preserve deterministic unknown-item behavior.
                }
            }
            return $this->error('unknown_item', "I don't have {$itemText} yet.");
        }
        $itemId = Uuid::v4();
        $name = $this->titleCase($itemText);
        $insert = $this->pdo->prepare(
            'INSERT INTO items (id, household_id, name) VALUES (:id, :household_id, :name)',
        );
        $insert->execute(['id' => $itemId, 'household_id' => $householdId, 'name' => $name]);
        return ['type' => 'resolved', 'itemId' => $itemId, 'name' => $name];
    }

    /** @param array<string, mixed> $command @return array<string, mixed> */
    private function resolveCommandItem(
        string $householdId,
        string $itemText,
        bool $create,
        array $command,
    ): array {
        if (is_string($command['itemId'] ?? null)) {
            $statement = $this->pdo->prepare(
                'SELECT id, name FROM items
                 WHERE id = :id AND household_id = :household_id',
            );
            $statement->execute([
                'id' => $command['itemId'],
                'household_id' => $householdId,
            ]);
            $row = $statement->fetch();
            if (!is_array($row)) {
                return $this->error('unknown_item', "I don't have {$itemText} yet.");
            }
            return [
                'type' => 'resolved',
                'itemId' => (string) $row['id'],
                'name' => (string) $row['name'],
            ];
        }
        $result = $this->resolveItem($householdId, $itemText, $create);
        if (($result['type'] ?? null) === 'clarification') {
            $result['command'] = $command;
        }
        return $result;
    }

    /** @param list<array{itemId: string, name: string}> $candidates @return array<string, mixed> */
    private function whichItem(string $itemText, array $candidates): array
    {
        $names = array_column($candidates, 'name');
        $spoken = count($names) === 1
            ? "Did you mean {$names[0]}?"
            : 'Did you mean ' . implode(' or ', $names) . '?';
        return [
            'type' => 'clarification',
            'spoken' => $spoken,
            'clarification' => ['type' => 'which_item', 'candidates' => $candidates],
        ];
    }

    /** @param list<string> $path @return array<string, mixed> */
    private function resolveLocation(string $householdId, array $path, bool $create): array
    {
        $parentId = null;
        $locationId = '';
        $names = [];
        foreach ($path as $segment) {
            $parentSql = $parentId === null ? 'parent_id IS NULL' : 'parent_id = :parent_id';
            $select = $this->pdo->prepare(
                'SELECT id, name FROM locations
                 WHERE household_id = :household_id AND ' . $parentSql . '
                   AND archived_at IS NULL AND LOWER(name) = LOWER(:name)',
            );
            $params = ['household_id' => $householdId, 'name' => $segment];
            if ($parentId !== null) {
                $params['parent_id'] = $parentId;
            }
            $select->execute($params);
            $row = $select->fetch();
            if (!is_array($row)) {
                if (!$create) {
                    return $this->error('unknown_location', "I don't have a place called {$segment}.");
                }
                $locationId = Uuid::v4();
                $name = $this->titleCase($segment);
                $now = $this->now();
                $insert = $this->pdo->prepare(
                    'INSERT INTO locations
                        (id, household_id, parent_id, name, archived_at, created_at, updated_at)
                     VALUES
                        (:id, :household_id, :parent_id, :name, NULL, :created_at, :updated_at)',
                );
                $insert->execute([
                    'id' => $locationId,
                    'household_id' => $householdId,
                    'parent_id' => $parentId,
                    'name' => $name,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            } else {
                $locationId = (string) $row['id'];
                $name = (string) $row['name'];
            }
            $names[] = $name;
            $parentId = $locationId;
        }
        return [
            'type' => 'resolved',
            'locationId' => $locationId,
            'pathLabel' => implode(' → ', $names),
        ];
    }

    /** @return array<string, mixed> */
    private function resolveLocationId(string $householdId, string $locationId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM locations
             WHERE id = :id AND household_id = :household_id AND archived_at IS NULL',
        );
        $statement->execute(['id' => $locationId, 'household_id' => $householdId]);
        if ($statement->fetchColumn() === false) {
            return $this->error('unknown_location', "I don't have a place called that place.");
        }
        return [
            'type' => 'resolved',
            'locationId' => $locationId,
            'pathLabel' => $this->locationLabel($householdId, $locationId),
        ];
    }

    private function changeLot(
        string $householdId,
        string $itemId,
        string $locationId,
        int $change,
        bool $putAway,
    ): int {
        $select = $this->pdo->prepare(
            'SELECT id, quantity, put_away_count FROM stock_lots
             WHERE household_id = :household_id AND item_id = :item_id AND location_id = :location_id',
        );
        $select->execute([
            'household_id' => $householdId,
            'item_id' => $itemId,
            'location_id' => $locationId,
        ]);
        $lot = $select->fetch();
        $quantity = max(0, (int) ($lot['quantity'] ?? 0) + $change);
        if (is_array($lot)) {
            if ($putAway) {
                $update = $this->pdo->prepare(
                    'UPDATE stock_lots
                     SET quantity = quantity + :delta,
                         put_away_count = put_away_count + 1,
                         last_activity_at = :last_activity_at
                     WHERE id = :id',
                );
                $update->execute([
                    'delta' => $change,
                    'last_activity_at' => $this->now(),
                    'id' => $lot['id'],
                ]);
            } else {
                $update = $this->pdo->prepare(
                    'UPDATE stock_lots
                     SET quantity = CASE
                            WHEN quantity + :delta_floor < 0 THEN 0
                            ELSE quantity + :delta_add
                         END,
                         last_activity_at = :last_activity_at
                     WHERE id = :id',
                );
                $update->execute([
                    'delta_floor' => $change,
                    'delta_add' => $change,
                    'last_activity_at' => $this->now(),
                    'id' => $lot['id'],
                ]);
            }
            $read = $this->pdo->prepare('SELECT quantity FROM stock_lots WHERE id = :id');
            $read->execute(['id' => $lot['id']]);
            $quantity = (int) $read->fetchColumn();
        } else {
            $insert = $this->pdo->prepare(
                'INSERT INTO stock_lots
                    (id, household_id, item_id, location_id, quantity, put_away_count, last_activity_at)
                 VALUES
                    (:id, :household_id, :item_id, :location_id, :quantity, :put_away_count, :last_activity_at)',
            );
            $insert->execute([
                'id' => Uuid::v4(),
                'household_id' => $householdId,
                'item_id' => $itemId,
                'location_id' => $locationId,
                'quantity' => $quantity,
                'put_away_count' => $putAway ? 1 : 0,
                'last_activity_at' => $this->now(),
            ]);
        }
        return $quantity;
    }

    /** @return list<array<string, mixed>> */
    private function lots(string $householdId, string $itemId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT stock_lots.location_id, stock_lots.quantity, stock_lots.put_away_count,
                    stock_lots.last_activity_at
             FROM stock_lots
             INNER JOIN locations ON locations.id = stock_lots.location_id
             WHERE stock_lots.household_id = :household_id
               AND stock_lots.item_id = :item_id
               AND locations.archived_at IS NULL',
        );
        $statement->execute(['household_id' => $householdId, 'item_id' => $itemId]);
        $lots = [];
        foreach ($statement->fetchAll() as $row) {
            $locationId = (string) $row['location_id'];
            $lots[] = [
                'locationId' => $locationId,
                'pathLabel' => $this->locationLabel($householdId, $locationId),
                'quantity' => (int) $row['quantity'],
                'putAwayCount' => (int) $row['put_away_count'],
                'lastActivityAt' => (string) $row['last_activity_at'],
            ];
        }
        return $lots;
    }

    /** @param array{itemId: string, name: string} $item @param list<array<string, mixed>> $lots */
    private function findOutcome(array $item, array $lots, string $intent): array
    {
        $inStock = array_values(array_filter($lots, static fn (array $lot): bool => $lot['quantity'] > 0));
        if ($intent === 'find' && $inStock !== []) {
            return $this->outcomeFromLots(
                $item,
                $lots,
                implode('; ', array_map(
                    fn (array $lot): string => "{$item['name']} — {$lot['pathLabel']} ({$lot['quantity']})",
                    $inStock,
                )),
            );
        }
        $usual = $this->usualLot($lots);
        if ($usual === null) {
            return $this->error('unknown_location', "I don't have a place called that place.");
        }
        $spoken = $intent === 'find'
            ? "You're out. You usually keep them in {$usual['pathLabel']}."
            : "You usually store {$item['name']} at {$usual['pathLabel']}.";
        return $this->outcomeFromLots($item, $lots, $spoken);
    }

    /** @param list<array<string, mixed>> $lots */
    private function usualLot(array $lots): ?array
    {
        usort($lots, static fn (array $a, array $b): int =>
            $b['putAwayCount'] <=> $a['putAwayCount']
            ?: strcmp($b['lastActivityAt'], $a['lastActivityAt'])
        );
        return $lots[0] ?? null;
    }

    /** @param list<array<string, mixed>> $lots */
    private function lotAt(array $lots, string $locationId): ?array
    {
        foreach ($lots as $lot) {
            if ($lot['locationId'] === $locationId) {
                return $lot;
            }
        }
        return null;
    }

    /** @param array{itemId: string, name: string} $item @return array<string, mixed> */
    private function ok(string $householdId, array $item, string $spoken): array
    {
        return $this->outcomeFromLots($item, $this->lots($householdId, $item['itemId']), $spoken);
    }

    /** @param array{itemId: string, name: string} $item @param list<array<string, mixed>> $lots */
    private function outcomeFromLots(array $item, array $lots, string $spoken): array
    {
        return [
            'type' => 'ok',
            'spoken' => $spoken,
            'itemId' => $item['itemId'],
            'itemName' => $item['name'],
            'lots' => array_map(static fn (array $lot): array => [
                'locationId' => $lot['locationId'],
                'pathLabel' => $lot['pathLabel'],
                'quantity' => $lot['quantity'],
            ], $lots),
        ];
    }

    private function locationLabel(string $householdId, string $locationId): string
    {
        $names = [];
        $seen = [];
        while (!isset($seen[$locationId])) {
            $seen[$locationId] = true;
            $statement = $this->pdo->prepare(
                'SELECT parent_id, name FROM locations
                 WHERE id = :id AND household_id = :household_id',
            );
            $statement->execute(['id' => $locationId, 'household_id' => $householdId]);
            $row = $statement->fetch();
            if (!is_array($row)) {
                break;
            }
            array_unshift($names, (string) $row['name']);
            if ($row['parent_id'] === null) {
                break;
            }
            $locationId = (string) $row['parent_id'];
        }
        return implode(' → ', $names);
    }

    /** @param list<string> $path */
    private function pathLabel(array $path): string
    {
        return implode(' → ', array_map(fn (string $segment): string => $this->titleCase($segment), $path));
    }

    /** @return list<string> */
    private function stringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        return array_values(array_filter(array_map(
            static fn (mixed $entry): string => is_string($entry) ? trim($entry) : '',
            $value,
        )));
    }

    private function titleCase(string $value): string
    {
        return implode(' ', array_map(
            static fn (string $word): string => ucfirst(strtolower($word)),
            preg_split('/\s+/', trim($value)) ?: [],
        ));
    }

    /** @return array{type: 'error', code: string, spoken: string} */
    private function error(string $code, string $spoken): array
    {
        return ['type' => 'error', 'code' => $code, 'spoken' => $spoken];
    }

    private function isUniqueViolation(Throwable $error): bool
    {
        $current = $error;
        while ($current !== null) {
            if ($current instanceof PDOException) {
                $sqlState = (string) ($current->errorInfo[0] ?? $current->getCode());
                if (in_array($sqlState, ['19', '23000', '23505'], true)) {
                    return true;
                }
            }
            $current = $current->getPrevious();
        }
        return false;
    }

    private function now(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }
}
