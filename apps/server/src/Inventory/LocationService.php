<?php
declare(strict_types=1);

namespace Putaway\Inventory;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Putaway\Auth\Uuid;
use Putaway\Households\HouseholdService;
use Throwable;

final class LocationService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly HouseholdService $households,
    ) {
    }

    /**
     * @return list<array{id: string, parentId: string|null, name: string, pathLabel: string}>
     *     |array{ok: false, code: 'forbidden'}
     */
    public function listLocations(string $userId, string $householdId): array
    {
        if ($this->households->requireMembership($userId, $householdId) === null) {
            return ['ok' => false, 'code' => 'forbidden'];
        }

        $statement = $this->pdo->prepare(
            'SELECT id, parent_id, name, archived_at
             FROM locations
             WHERE household_id = :household_id',
        );
        $statement->execute(['household_id' => $householdId]);

        /** @var array<string, array{id: string, parent_id: string|null, name: string, archived_at: string|null}> $byId */
        $byId = [];
        foreach ($statement->fetchAll() as $row) {
            $id = (string) $row['id'];
            $byId[$id] = [
                'id' => $id,
                'parent_id' => $row['parent_id'] === null ? null : (string) $row['parent_id'],
                'name' => (string) $row['name'],
                'archived_at' => $row['archived_at'] === null ? null : (string) $row['archived_at'],
            ];
        }

        $result = [];
        foreach ($byId as $row) {
            if ($this->hasArchivedAncestor($row['id'], $byId)) {
                continue;
            }
            $result[] = [
                'id' => $row['id'],
                'parentId' => $row['parent_id'],
                'name' => $row['name'],
                'pathLabel' => $this->pathLabelFromRows($row['id'], $byId),
            ];
        }

        usort(
            $result,
            static fn (array $left, array $right): int =>
                strcasecmp($left['pathLabel'], $right['pathLabel']),
        );
        return $result;
    }

    /**
     * @return array{ok: true, locationId: string, pathLabel: string}
     *     |array{ok: false, code: 'forbidden'|'archived'|'duplicate_name'|'invalid_parent'}
     */
    public function createLocation(
        string $userId,
        string $householdId,
        string $name,
        ?string $parentId,
    ): array {
        if (!$this->isOwner($userId, $householdId)) {
            return $this->failure('forbidden');
        }

        $name = trim($name);
        if ($name === '') {
            return $this->failure('duplicate_name');
        }

        if ($parentId !== null) {
            $parent = $this->loadLocation($householdId, $parentId);
            if ($parent === null) {
                return $this->failure('invalid_parent');
            }
            if ($parent['archived_at'] !== null) {
                return $this->failure('archived');
            }
        }

        if ($this->hasSiblingName($householdId, $parentId, $name)) {
            return $this->failure('duplicate_name');
        }

        $locationId = Uuid::v4();
        $now = $this->now();
        $statement = $this->pdo->prepare(
            'INSERT INTO locations
                (id, household_id, parent_id, name, archived_at, created_at, updated_at)
             VALUES
                (:id, :household_id, :parent_id, :name, NULL, :created_at, :updated_at)',
        );
        $statement->execute([
            'id' => $locationId,
            'household_id' => $householdId,
            'parent_id' => $parentId,
            'name' => $this->titleCase($name),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return [
            'ok' => true,
            'locationId' => $locationId,
            'pathLabel' => $this->pathLabel($householdId, $locationId),
        ];
    }

    /**
     * @return array{ok: true}
     *     |array{ok: false, code: 'forbidden'|'archived'|'duplicate_name'|'invalid_parent'}
     */
    public function renameLocation(
        string $userId,
        string $householdId,
        string $locationId,
        string $name,
    ): array {
        return $this->updateLocation(
            $userId,
            $householdId,
            $locationId,
            ['name' => $name],
        );
    }

    /**
     * @return array{ok: true}
     *     |array{ok: false, code: 'forbidden'|'archived'|'duplicate_name'|'invalid_parent'}
     */
    public function moveLocation(
        string $userId,
        string $householdId,
        string $locationId,
        ?string $newParentId,
    ): array {
        return $this->updateLocation(
            $userId,
            $householdId,
            $locationId,
            ['parentId' => $newParentId],
        );
    }

    /**
     * @param array{name?: string, parentId?: string|null} $changes
     * @return array{ok: true}
     *     |array{ok: false, code: 'forbidden'|'archived'|'duplicate_name'|'invalid_parent'}
     */
    public function updateLocation(
        string $userId,
        string $householdId,
        string $locationId,
        array $changes,
    ): array {
        if (!$this->isOwner($userId, $householdId)) {
            return $this->failure('forbidden');
        }

        $this->pdo->beginTransaction();
        try {
            $location = $this->loadLocation($householdId, $locationId, true);
            if ($location === null) {
                $this->pdo->rollBack();
                return $this->failure('forbidden');
            }
            if ($location['archived_at'] !== null) {
                $this->pdo->rollBack();
                return $this->failure('archived');
            }

            $name = array_key_exists('name', $changes)
                ? trim((string) $changes['name'])
                : $location['name'];
            $newParentId = array_key_exists('parentId', $changes)
                ? $changes['parentId']
                : $location['parent_id'];

            if ($newParentId !== null) {
                $parent = $this->loadLocation($householdId, $newParentId, true);
                if ($parent === null) {
                    $this->pdo->rollBack();
                    return $this->failure('invalid_parent');
                }
                if ($parent['archived_at'] !== null) {
                    $this->pdo->rollBack();
                    return $this->failure('archived');
                }
                if ($this->wouldCycle($householdId, $locationId, $newParentId)) {
                    $this->pdo->rollBack();
                    return $this->failure('invalid_parent');
                }
            }

            if ($name === '' || $this->hasSiblingName(
                $householdId,
                $newParentId,
                $name,
                $locationId,
            )) {
                $this->pdo->rollBack();
                return $this->failure('duplicate_name');
            }

            $statement = $this->pdo->prepare(
                'UPDATE locations
                 SET name = :name, parent_id = :parent_id, updated_at = :updated_at
                 WHERE id = :id AND household_id = :household_id',
            );
            $statement->execute([
                'name' => $name,
                'parent_id' => $newParentId,
                'updated_at' => $this->now(),
                'id' => $locationId,
                'household_id' => $householdId,
            ]);
            $this->pdo->commit();
            return ['ok' => true];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    private function isOwner(string $userId, string $householdId): bool
    {
        return ($this->households->requireMembership($userId, $householdId)['role'] ?? null)
            === 'owner';
    }

    /**
     * @return array{id: string, parent_id: string|null, name: string, archived_at: string|null}|null
     */
    private function loadLocation(
        string $householdId,
        string $locationId,
        bool $forUpdate = false,
    ): ?array
    {
        $lock = $forUpdate && $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? ' FOR UPDATE'
            : '';
        $statement = $this->pdo->prepare(
            'SELECT id, parent_id, name, archived_at
             FROM locations
             WHERE id = :id AND household_id = :household_id' . $lock,
        );
        $statement->execute(['id' => $locationId, 'household_id' => $householdId]);
        $row = $statement->fetch();

        if (!is_array($row)) {
            return null;
        }
        return [
            'id' => (string) $row['id'],
            'parent_id' => $row['parent_id'] === null ? null : (string) $row['parent_id'],
            'name' => (string) $row['name'],
            'archived_at' => $row['archived_at'] === null ? null : (string) $row['archived_at'],
        ];
    }

    private function hasSiblingName(
        string $householdId,
        ?string $parentId,
        string $name,
        ?string $exceptId = null,
    ): bool {
        $parentWhere = $parentId === null
            ? 'parent_id IS NULL'
            : 'parent_id = :parent_id';
        $sql = 'SELECT id FROM locations
                WHERE household_id = :household_id
                  AND ' . $parentWhere . '
                  AND archived_at IS NULL
                  AND LOWER(name) = LOWER(:name)';
        if ($exceptId !== null) {
            $sql .= ' AND id <> :except_id';
        }

        $parameters = ['household_id' => $householdId, 'name' => $name];
        if ($parentId !== null) {
            $parameters['parent_id'] = $parentId;
        }
        if ($exceptId !== null) {
            $parameters['except_id'] = $exceptId;
        }

        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        return $statement->fetchColumn() !== false;
    }

    private function wouldCycle(
        string $householdId,
        string $locationId,
        string $newParentId,
    ): bool {
        $currentId = $newParentId;
        $seen = [];

        while (true) {
            if ($currentId === $locationId || isset($seen[$currentId])) {
                return true;
            }
            $seen[$currentId] = true;
            $current = $this->loadLocation($householdId, $currentId);
            if ($current === null || $current['parent_id'] === null) {
                return false;
            }
            $currentId = $current['parent_id'];
        }
    }

    private function pathLabel(string $householdId, string $locationId): string
    {
        $names = [];
        $currentId = $locationId;
        $seen = [];

        while (!isset($seen[$currentId])) {
            $seen[$currentId] = true;
            $current = $this->loadLocation($householdId, $currentId);
            if ($current === null) {
                break;
            }
            if ($current['archived_at'] === null) {
                array_unshift($names, $current['name']);
            }
            if ($current['parent_id'] === null) {
                break;
            }
            $currentId = $current['parent_id'];
        }
        return implode(' → ', $names);
    }

    /**
     * @param array<string, array{id: string, parent_id: string|null, name: string, archived_at: string|null}> $byId
     */
    private function hasArchivedAncestor(string $locationId, array $byId): bool
    {
        $currentId = $locationId;
        $seen = [];
        while (isset($byId[$currentId]) && !isset($seen[$currentId])) {
            $seen[$currentId] = true;
            $row = $byId[$currentId];
            if ($row['archived_at'] !== null) {
                return true;
            }
            if ($row['parent_id'] === null) {
                return false;
            }
            $currentId = $row['parent_id'];
        }
        return false;
    }

    /**
     * @param array<string, array{id: string, parent_id: string|null, name: string, archived_at: string|null}> $byId
     */
    private function pathLabelFromRows(string $locationId, array $byId): string
    {
        $names = [];
        $currentId = $locationId;
        $seen = [];
        while (isset($byId[$currentId]) && !isset($seen[$currentId])) {
            $seen[$currentId] = true;
            $row = $byId[$currentId];
            if ($row['archived_at'] === null) {
                array_unshift($names, $row['name']);
            }
            if ($row['parent_id'] === null) {
                break;
            }
            $currentId = $row['parent_id'];
        }
        return implode(' → ', $names);
    }

    private function titleCase(string $name): string
    {
        $words = preg_split('/\s+/', trim($name)) ?: [];
        foreach ($words as $index => $word) {
            if (preg_match('/[A-Z]/', $word) === 1) {
                continue;
            }
            $lower = strtolower($word);
            if ($index === 0 || strlen($lower) === 1) {
                $words[$index] = ucfirst($lower);
            } else {
                $words[$index] = $lower;
            }
        }
        return implode(' ', $words);
    }

    /** @return array{ok: false, code: string} */
    private function failure(string $code): array
    {
        return ['ok' => false, 'code' => $code];
    }

    private function now(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }
}
