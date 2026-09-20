<?php
declare(strict_types=1);

namespace Putaway\Households;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use PDO;
use Putaway\Auth\Uuid;
use RuntimeException;
use Throwable;

final class HouseholdService
{
    private const INVITE_TTL_DAYS = 7;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{householdId: string, role: 'owner'} */
    public function createHousehold(string $userId, string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new InvalidArgumentException('Household name is required');
        }

        $householdId = Uuid::v4();
        $now = $this->now()->format('Y-m-d H:i:s');
        $this->pdo->beginTransaction();

        try {
            $household = $this->pdo->prepare(
                'INSERT INTO households (id, name, created_at, updated_at)
                 VALUES (:id, :name, :created_at, :updated_at)',
            );
            $household->execute([
                'id' => $householdId,
                'name' => $name,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $member = $this->pdo->prepare(
                'INSERT INTO household_members (household_id, user_id, role)
                 VALUES (:household_id, :user_id, :role)',
            );
            $member->execute([
                'household_id' => $householdId,
                'user_id' => $userId,
                'role' => 'owner',
            ]);

            $this->pdo->commit();
            return ['householdId' => $householdId, 'role' => 'owner'];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    /** @return list<array{householdId: string, name: string, role: 'owner'|'member'}> */
    public function listHouseholds(string $userId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT households.id AS household_id, households.name, household_members.role
             FROM household_members
             INNER JOIN households ON households.id = household_members.household_id
             WHERE household_members.user_id = :user_id
             ORDER BY households.created_at, households.id',
        );
        $statement->execute(['user_id' => $userId]);

        $result = [];
        foreach ($statement->fetchAll() as $row) {
            $result[] = [
                'householdId' => (string) $row['household_id'],
                'name' => (string) $row['name'],
                'role' => (string) $row['role'],
            ];
        }
        return $result;
    }

    /** @return array{role: 'owner'|'member'}|null */
    public function requireMembership(string $userId, string $householdId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT role FROM household_members
             WHERE user_id = :user_id AND household_id = :household_id',
        );
        $statement->execute([
            'user_id' => $userId,
            'household_id' => $householdId,
        ]);
        $role = $statement->fetchColumn();

        return is_string($role) ? ['role' => $role] : null;
    }

    /** @return array{token: string} */
    public function createInvite(
        string $householdId,
        string $email,
        string $role,
        string $createdByUserId,
    ): array {
        if ($role !== 'owner' && $role !== 'member') {
            throw new InvalidArgumentException('invalid invite role');
        }

        $email = strtolower(trim($email));
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidArgumentException('invalid invite email');
        }

        if (($this->requireMembership($createdByUserId, $householdId)['role'] ?? null) !== 'owner') {
            throw new RuntimeException('only owners can create invites');
        }

        $token = bin2hex(random_bytes(32));
        $statement = $this->pdo->prepare(
            'INSERT INTO invites (id, household_id, email, role, token, expires_at, accepted_at)
             VALUES (:id, :household_id, :email, :role, :token, :expires_at, NULL)',
        );
        $statement->execute([
            'id' => Uuid::v4(),
            'household_id' => $householdId,
            'email' => $email,
            'role' => $role,
            'token' => $token,
            'expires_at' => $this->now()->modify('+' . self::INVITE_TTL_DAYS . ' days')
                ->format('Y-m-d H:i:s'),
        ]);

        return ['token' => $token];
    }

    /**
     * @return array{householdId: string}|array{error: 'expired'|'already_used'|'email_mismatch'|'not_found'}
     */
    public function acceptInvite(string $token, string $userId, string $email): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, household_id, email, role, expires_at, accepted_at
             FROM invites WHERE token = :token',
        );
        $statement->execute(['token' => $token]);
        $invite = $statement->fetch();

        if (!is_array($invite)) {
            return ['error' => 'not_found'];
        }
        if ($invite['accepted_at'] !== null) {
            return ['error' => 'already_used'];
        }
        if ((string) $invite['expires_at'] <= $this->now()->format('Y-m-d H:i:s')) {
            return ['error' => 'expired'];
        }
        if (strtolower((string) $invite['email']) !== strtolower(trim($email))) {
            return ['error' => 'email_mismatch'];
        }

        $this->pdo->beginTransaction();
        try {
            $claim = $this->pdo->prepare(
                'UPDATE invites SET accepted_at = :accepted_at
                 WHERE id = :id AND accepted_at IS NULL',
            );
            $claim->execute([
                'accepted_at' => $this->now()->format('Y-m-d H:i:s'),
                'id' => $invite['id'],
            ]);
            if ($claim->rowCount() !== 1) {
                $this->pdo->rollBack();
                return ['error' => 'already_used'];
            }

            $member = $this->pdo->prepare(
                'INSERT INTO household_members (household_id, user_id, role)
                 VALUES (:household_id, :user_id, :role)',
            );
            $member->execute([
                'household_id' => $invite['household_id'],
                'user_id' => $userId,
                'role' => $invite['role'],
            ]);

            $this->pdo->commit();
            return ['householdId' => (string) $invite['household_id']];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    private function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }
}
