<?php
declare(strict_types=1);

namespace Putaway\Commands;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Putaway\Auth\Uuid;

final class ReceiptStore
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null */
    public function find(string $householdId, string $userId, string $clientCommandId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT result_json FROM command_receipts
             WHERE household_id = :household_id
               AND user_id = :user_id
               AND client_command_id = :client_command_id',
        );
        $statement->execute([
            'household_id' => $householdId,
            'user_id' => $userId,
            'client_command_id' => $clientCommandId,
        ]);
        $json = $statement->fetchColumn();
        if (!is_string($json)) {
            return null;
        }
        $result = json_decode($json, true);
        return is_array($result) ? $result : null;
    }

    /** @param array<string, mixed> $result */
    public function save(
        string $householdId,
        string $userId,
        string $clientCommandId,
        array $result,
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO command_receipts
                (id, household_id, user_id, client_command_id, result_json, created_at)
             VALUES
                (:id, :household_id, :user_id, :client_command_id, :result_json, :created_at)',
        );
        $statement->execute([
            'id' => Uuid::v4(),
            'household_id' => $householdId,
            'user_id' => $userId,
            'client_command_id' => $clientCommandId,
            'result_json' => json_encode($result, JSON_THROW_ON_ERROR),
            'created_at' => (new DateTimeImmutable('now', new DateTimeZone('UTC')))
                ->format('Y-m-d H:i:s'),
        ]);
    }
}
