<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Households\HouseholdService;

final class HouseholdServiceTest extends TestCase
{
    private PDO $pdo;
    private HouseholdService $households;

    protected function setUp(): void
    {
        $this->pdo = new PDO('sqlite::memory:');
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->exec(
            'CREATE TABLE users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE
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
        $this->pdo->exec(
            "INSERT INTO users (id, email) VALUES
                ('user-a', 'owner@example.com'),
                ('user-b', 'member@example.com'),
                ('user-c', 'other@example.com')",
        );

        $this->households = new HouseholdService($this->pdo);
    }

    public function test_create_household_makes_creator_owner_and_lists_mobile_shape(): void
    {
        $created = $this->households->createHousehold('user-a', 'Oliver house');

        self::assertSame('owner', $created['role']);
        self::assertNotSame('', $created['householdId']);
        self::assertSame(
            [[
                'householdId' => $created['householdId'],
                'name' => 'Oliver house',
                'role' => 'owner',
            ]],
            $this->households->listHouseholds('user-a'),
        );
        self::assertSame(
            ['role' => 'owner'],
            $this->households->requireMembership('user-a', $created['householdId']),
        );
        self::assertNull($this->households->requireMembership('user-b', $created['householdId']));
    }

    public function test_owner_can_create_invite_and_matching_user_can_accept_it(): void
    {
        $household = $this->households->createHousehold('user-a', 'Oliver house');
        $invite = $this->households->createInvite(
            $household['householdId'],
            ' Member@Example.com ',
            'member',
            'user-a',
        );

        self::assertNotSame('', $invite['token']);
        self::assertSame(
            ['householdId' => $household['householdId']],
            $this->households->acceptInvite($invite['token'], 'user-b', 'member@example.com'),
        );
        self::assertSame(
            ['role' => 'member'],
            $this->households->requireMembership('user-b', $household['householdId']),
        );
    }

    public function test_non_owner_cannot_create_invite(): void
    {
        $household = $this->households->createHousehold('user-a', 'Oliver house');
        $invite = $this->households->createInvite(
            $household['householdId'],
            'member@example.com',
            'member',
            'user-a',
        );
        $this->households->acceptInvite($invite['token'], 'user-b', 'member@example.com');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('only owners can create invites');
        $this->households->createInvite(
            $household['householdId'],
            'other@example.com',
            'member',
            'user-b',
        );
    }

    public function test_invite_rejects_wrong_email_and_cannot_be_reused(): void
    {
        $household = $this->households->createHousehold('user-a', 'Oliver house');
        $invite = $this->households->createInvite(
            $household['householdId'],
            'member@example.com',
            'member',
            'user-a',
        );

        self::assertSame(
            ['error' => 'email_mismatch'],
            $this->households->acceptInvite($invite['token'], 'user-c', 'other@example.com'),
        );
        self::assertSame(
            ['householdId' => $household['householdId']],
            $this->households->acceptInvite($invite['token'], 'user-b', 'member@example.com'),
        );
        self::assertSame(
            ['error' => 'already_used'],
            $this->households->acceptInvite($invite['token'], 'user-b', 'member@example.com'),
        );
    }
}
