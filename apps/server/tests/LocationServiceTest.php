<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Auth\AuthService;
use Putaway\Auth\NullMailer;
use Putaway\Households\HouseholdService;
use Putaway\Http\Request;
use Putaway\Inventory\LocationController;
use Putaway\Inventory\LocationService;

final class LocationServiceTest extends TestCase
{
    private PDO $pdo;
    private LocationService $locations;
    private LocationController $controller;

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
            );',
        );
        $this->pdo->exec(
            "INSERT INTO users (id, email, name, created_at) VALUES
                ('owner', 'owner@example.com', 'Owner', '2026-09-20 12:00:00'),
                ('member', 'member@example.com', 'Member', '2026-09-20 12:00:00'),
                ('stranger', 'stranger@example.com', 'Stranger', '2026-09-20 12:00:00');
             INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES
                ('session-owner', 'owner', 'token-owner', '2099-01-01 00:00:00', '2026-09-20 12:00:00'),
                ('session-member', 'member', 'token-member', '2099-01-01 00:00:00', '2026-09-20 12:00:00');
             INSERT INTO households (id, name, created_at, updated_at)
                VALUES ('home', 'Home', '2026-09-20 12:00:00', '2026-09-20 12:00:00');
             INSERT INTO household_members (household_id, user_id, role) VALUES
                ('home', 'owner', 'owner'),
                ('home', 'member', 'member');",
        );

        $households = new HouseholdService($this->pdo);
        $this->locations = new LocationService($this->pdo, $households);
        $auth = new AuthService(
            $this->pdo,
            new NullMailer(),
            'https://put-away.com',
            'noreply@put-away.com',
            2_592_000,
        );
        $this->controller = new LocationController($this->locations, $auth);
    }

    public function test_owner_creates_nested_locations_and_member_lists_mobile_shape(): void
    {
        $basement = $this->locations->createLocation('owner', 'home', ' Basement ', null);
        $cabinet = $this->locations->createLocation(
            'owner',
            'home',
            'Cabinet',
            $basement['locationId'],
        );

        self::assertSame(
            ['ok' => true, 'locationId' => $basement['locationId'], 'pathLabel' => 'Basement'],
            $basement,
        );
        self::assertSame('Basement → Cabinet', $cabinet['pathLabel']);
        self::assertSame([
            [
                'id' => $basement['locationId'],
                'parentId' => null,
                'name' => 'Basement',
                'pathLabel' => 'Basement',
            ],
            [
                'id' => $cabinet['locationId'],
                'parentId' => $basement['locationId'],
                'name' => 'Cabinet',
                'pathLabel' => 'Basement → Cabinet',
            ],
        ], $this->locations->listLocations('member', 'home'));
    }

    public function test_writes_require_owner_and_reads_require_membership(): void
    {
        self::assertSame(
            ['ok' => false, 'code' => 'forbidden'],
            $this->locations->createLocation('member', 'home', 'Attic', null),
        );
        self::assertSame(
            ['ok' => false, 'code' => 'forbidden'],
            $this->locations->listLocations('stranger', 'home'),
        );
    }

    public function test_duplicate_sibling_names_are_case_insensitive(): void
    {
        $this->locations->createLocation('owner', 'home', 'Attic', null);

        self::assertSame(
            ['ok' => false, 'code' => 'duplicate_name'],
            $this->locations->createLocation('owner', 'home', ' attic ', null),
        );
    }

    public function test_move_prevents_cycles_and_duplicate_sibling_names(): void
    {
        $attic = $this->locations->createLocation('owner', 'home', 'Attic', null);
        $box = $this->locations->createLocation('owner', 'home', 'Box', $attic['locationId']);
        $garage = $this->locations->createLocation('owner', 'home', 'Garage', null);
        $this->locations->createLocation('owner', 'home', 'Box', $garage['locationId']);

        self::assertSame(
            ['ok' => false, 'code' => 'invalid_parent'],
            $this->locations->moveLocation('owner', 'home', $attic['locationId'], $box['locationId']),
        );
        self::assertSame(
            ['ok' => false, 'code' => 'duplicate_name'],
            $this->locations->moveLocation('owner', 'home', $box['locationId'], $garage['locationId']),
        );
    }

    public function test_rename_rejects_case_insensitive_duplicate_and_updates_descendant_paths(): void
    {
        $attic = $this->locations->createLocation('owner', 'home', 'Attic', null);
        $box = $this->locations->createLocation('owner', 'home', 'Box', $attic['locationId']);
        $this->locations->createLocation('owner', 'home', 'Garage', null);

        self::assertSame(
            ['ok' => false, 'code' => 'duplicate_name'],
            $this->locations->renameLocation('owner', 'home', $attic['locationId'], 'garage'),
        );
        self::assertSame(
            ['ok' => true],
            $this->locations->renameLocation('owner', 'home', $attic['locationId'], 'Loft'),
        );
        $rows = $this->locations->listLocations('owner', 'home');
        self::assertSame(
            'Loft → Box',
            array_values(array_filter(
                $rows,
                static fn (array $row): bool => $row['id'] === $box['locationId'],
            ))[0]['pathLabel'],
        );
    }

    public function test_controller_matches_mobile_create_patch_and_list_contracts(): void
    {
        $created = $this->controller->createLocation(
            $this->request('POST', ['name' => 'Attic', 'parentId' => null]),
            'home',
        );
        self::assertSame(201, $created->status);
        $createBody = $this->json($created->body);
        self::assertSame(['ok', 'locationId', 'pathLabel'], array_keys($createBody));

        $patched = $this->controller->updateLocation(
            $this->request('PATCH', ['locationId' => $createBody['locationId'], 'name' => 'Loft']),
            'home',
        );
        self::assertSame(200, $patched->status);
        self::assertSame(['ok' => true], $this->json($patched->body));

        $listed = $this->controller->listLocations(
            $this->request('GET', token: 'token-member'),
            'home',
        );
        self::assertSame(200, $listed->status);
        self::assertSame(['id', 'parentId', 'name', 'pathLabel'], array_keys($this->json($listed->body)[0]));
    }

    public function test_combined_rename_and_move_validates_name_at_final_parent(): void
    {
        $attic = $this->locations->createLocation('owner', 'home', 'Attic', null);
        $box = $this->locations->createLocation('owner', 'home', 'Box', $attic['locationId']);
        $garage = $this->locations->createLocation('owner', 'home', 'Garage', null);
        $this->locations->createLocation('owner', 'home', 'Bin', $garage['locationId']);

        $response = $this->controller->updateLocation(
            $this->request('PATCH', [
                'locationId' => $box['locationId'],
                'name' => 'Bin',
                'parentId' => $garage['locationId'],
            ]),
            'home',
        );

        self::assertSame(409, $response->status);
        self::assertSame('duplicate_name', $this->json($response->body)['error']);
        $rows = $this->locations->listLocations('owner', 'home');
        $boxRow = array_values(array_filter(
            $rows,
            static fn (array $row): bool => $row['id'] === $box['locationId'],
        ))[0];
        self::assertSame('Box', $boxRow['name']);
        self::assertSame($attic['locationId'], $boxRow['parentId']);
    }

    public function test_combined_rename_and_move_can_use_name_available_at_final_parent(): void
    {
        $attic = $this->locations->createLocation('owner', 'home', 'Attic', null);
        $box = $this->locations->createLocation('owner', 'home', 'Box', $attic['locationId']);
        $this->locations->createLocation('owner', 'home', 'Bin', $attic['locationId']);
        $garage = $this->locations->createLocation('owner', 'home', 'Garage', null);

        $response = $this->controller->updateLocation(
            $this->request('PATCH', [
                'locationId' => $box['locationId'],
                'name' => 'Bin',
                'parentId' => $garage['locationId'],
            ]),
            'home',
        );

        self::assertSame(200, $response->status);
        $rows = $this->locations->listLocations('owner', 'home');
        $moved = array_values(array_filter(
            $rows,
            static fn (array $row): bool => $row['id'] === $box['locationId'],
        ))[0];
        self::assertSame('Garage → Bin', $moved['pathLabel']);
    }

    public function test_controller_returns_mobile_friendly_errors(): void
    {
        $this->locations->createLocation('owner', 'home', 'Attic', null);
        $duplicate = $this->controller->createLocation(
            $this->request('POST', ['name' => 'attic', 'parentId' => null]),
            'home',
        );

        self::assertSame(409, $duplicate->status);
        self::assertSame([
            'error' => 'duplicate_name',
            'spoken' => 'A place with that name already exists there.',
        ], $this->json($duplicate->body));

        $forbidden = $this->controller->listLocations(
            $this->request('GET', token: 'missing-token'),
            'home',
        );
        self::assertSame(401, $forbidden->status);
    }

    /** @param array<string, mixed>|null $body */
    private function request(
        string $method,
        ?array $body = null,
        string $token = 'token-owner',
    ): Request {
        return Request::fake(
            $method,
            '/api/households/home/locations',
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
