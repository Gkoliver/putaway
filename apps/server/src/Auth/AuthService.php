<?php
declare(strict_types=1);

namespace Putaway\Auth;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use PDO;
use RuntimeException;
use Throwable;

final class AuthService
{
    private const MAGIC_LINK_TTL_SECONDS = 900;
    private const MAGIC_LINK_LIMIT = 5;

    public function __construct(
        private readonly PDO $pdo,
        private readonly Mailer $mailer,
        private readonly string $appUrl,
        private readonly string $mailFrom,
        private readonly int $sessionTtlSeconds,
    ) {
    }

    public function requestMagicLink(string $email): void
    {
        $email = strtolower(trim($email));
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidArgumentException('A valid email address is required');
        }

        $now = $this->now();
        $rateLimitStart = $now->format('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM magic_link_tokens WHERE email = :email AND expires_at > :rate_limit_start',
        );
        $statement->execute(['email' => $email, 'rate_limit_start' => $rateLimitStart]);
        if ((int) $statement->fetchColumn() >= self::MAGIC_LINK_LIMIT) {
            throw new RateLimitExceeded('Too many magic-link requests');
        }

        $id = Uuid::v4();
        $token = bin2hex(random_bytes(32));
        $expiresAt = $now->modify('+' . self::MAGIC_LINK_TTL_SECONDS . ' seconds')
            ->format('Y-m-d H:i:s');
        $insert = $this->pdo->prepare(
            'INSERT INTO magic_link_tokens (id, email, token, expires_at, consumed_at)
             VALUES (:id, :email, :token, :expires_at, NULL)',
        );
        $insert->execute([
            'id' => $id,
            'email' => $email,
            'token' => $token,
            'expires_at' => $expiresAt,
        ]);

        $url = rtrim($this->appUrl, '/') . '/auth/verify?token=' . rawurlencode($token);
        try {
            $this->mailer->sendMagicLink($email, $url, $this->mailFrom);
        } catch (Throwable $error) {
            $delete = $this->pdo->prepare('DELETE FROM magic_link_tokens WHERE id = :id');
            $delete->execute(['id' => $id]);
            throw $error;
        }
    }

    /** @return array{userId: string, sessionToken: string} */
    public function consumeMagicLink(string $token): array
    {
        if ($token === '') {
            throw new RuntimeException('Invalid or expired magic link');
        }

        $now = $this->now();
        $nowText = $now->format('Y-m-d H:i:s');
        $this->pdo->beginTransaction();

        try {
            $select = $this->pdo->prepare(
                'SELECT id, email FROM magic_link_tokens
                 WHERE token = :token AND consumed_at IS NULL AND expires_at > :now',
            );
            $select->execute(['token' => $token, 'now' => $nowText]);
            $magicLink = $select->fetch();
            if (!is_array($magicLink)) {
                throw new RuntimeException('Invalid or expired magic link');
            }

            $consume = $this->pdo->prepare(
                'UPDATE magic_link_tokens SET consumed_at = :consumed_at
                 WHERE id = :id AND consumed_at IS NULL',
            );
            $consume->execute(['consumed_at' => $nowText, 'id' => $magicLink['id']]);
            if ($consume->rowCount() !== 1) {
                throw new RuntimeException('Invalid or expired magic link');
            }

            $userId = $this->findOrCreateUser((string) $magicLink['email'], $nowText);
            $sessionToken = bin2hex(random_bytes(32));
            $session = $this->pdo->prepare(
                'INSERT INTO sessions (id, user_id, token, expires_at, created_at)
                 VALUES (:id, :user_id, :token, :expires_at, :created_at)',
            );
            $session->execute([
                'id' => Uuid::v4(),
                'user_id' => $userId,
                'token' => $sessionToken,
                'expires_at' => $now->modify('+' . $this->sessionTtlSeconds . ' seconds')
                    ->format('Y-m-d H:i:s'),
                'created_at' => $nowText,
            ]);

            $this->pdo->commit();
            return ['userId' => $userId, 'sessionToken' => $sessionToken];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    public function userIdForBearer(?string $token): ?string
    {
        $user = $this->userForBearer($token);
        return $user['id'] ?? null;
    }

    /** @return array{id: string, email: string}|null */
    public function userForBearer(?string $token): ?array
    {
        if ($token === null || $token === '') {
            return null;
        }

        $statement = $this->pdo->prepare(
            'SELECT users.id, users.email
             FROM sessions
             INNER JOIN users ON users.id = sessions.user_id
             WHERE sessions.token = :token AND sessions.expires_at > :now',
        );
        $statement->execute([
            'token' => $token,
            'now' => $this->now()->format('Y-m-d H:i:s'),
        ]);
        $user = $statement->fetch();

        if (!is_array($user)) {
            return null;
        }

        return ['id' => (string) $user['id'], 'email' => (string) $user['email']];
    }

    /** @return array{id: string, email: string}|null */
    public function userById(string $userId): ?array
    {
        $statement = $this->pdo->prepare('SELECT id, email FROM users WHERE id = :id');
        $statement->execute(['id' => $userId]);
        $user = $statement->fetch();

        return is_array($user)
            ? ['id' => (string) $user['id'], 'email' => (string) $user['email']]
            : null;
    }

    public function revokeSession(string $sessionToken): void
    {
        $statement = $this->pdo->prepare('DELETE FROM sessions WHERE token = :token');
        $statement->execute(['token' => $sessionToken]);
    }

    private function findOrCreateUser(string $email, string $now): string
    {
        $select = $this->pdo->prepare('SELECT id FROM users WHERE email = :email');
        $select->execute(['email' => $email]);
        $userId = $select->fetchColumn();
        if (is_string($userId)) {
            return $userId;
        }

        $userId = Uuid::v4();
        $insert = $this->pdo->prepare(
            'INSERT INTO users (id, email, name, created_at)
             VALUES (:id, :email, :name, :created_at)',
        );
        $insert->execute([
            'id' => $userId,
            'email' => $email,
            'name' => strstr($email, '@', true) ?: $email,
            'created_at' => $now,
        ]);
        return $userId;
    }

    private function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }
}
