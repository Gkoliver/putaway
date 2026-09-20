<?php
declare(strict_types=1);

namespace Putaway\Web;

require_once __DIR__ . '/layout.php';

use Putaway\Auth\AuthService;
use Putaway\Households\HouseholdService;
use Putaway\Http\Request;
use Putaway\Http\Response;
use Putaway\Inventory\LocationService;

final class PlacesPage
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly HouseholdService $households,
        private readonly LocationService $locations,
        private readonly Csrf $csrf,
    ) {
    }

    public function show(Request $request): Response
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->signInRedirect();
        }

        $token = $request->cookie('putaway_csrf') ?? $this->csrf->generate();
        $households = $this->households->listHouseholds($userId);
        $selected = $this->selectedHousehold($households, $request->queryParam('household'));
        $content = $this->householdPicker($households, $selected['householdId'] ?? null);
        if ($selected === null) {
            $content .= '<section><p>You do not belong to a household yet.</p></section>';
            return $this->page($content, $token);
        }

        $rows = $this->locations->listLocations($userId, $selected['householdId']);
        if (isset($rows['ok']) && $rows['ok'] === false) {
            return Response::html(layout('Places', '<p class="notice error">Access denied.</p>', true), 403);
        }

        $householdId = escape($selected['householdId']);
        if ($selected['role'] === 'owner') {
            $content .= '<section><h2>Add a place</h2><form method="post" action="/places/create">'
                . csrfInput($token)
                . '<input type="hidden" name="householdId" value="' . $householdId . '">'
                . '<label>Name<input name="name" required></label>'
                . '<label>Inside<select name="parentId"><option value="">Top level</option>'
                . $this->locationOptions($rows) . '</select></label>'
                . '<button type="submit">Add place</button></form></section>';
        }

        $content .= '<div class="grid">';
        foreach ($rows as $row) {
            $depth = max(0, substr_count($row['pathLabel'], '→'));
            $content .= '<section class="card place" style="--depth:' . $depth . '"><strong>'
                . escape($row['name']) . '</strong><p class="muted">' . escape($row['pathLabel']) . '</p>';
            if ($selected['role'] === 'owner') {
                $content .= '<form method="post" action="/places/rename">'
                    . csrfInput($token)
                    . $this->hiddenIds($householdId, $row['id'])
                    . '<label>Rename<input name="name" value="' . escape($row['name']) . '" required></label>'
                    . '<button type="submit">Rename</button></form>'
                    . '<form method="post" action="/places/reparent">'
                    . csrfInput($token)
                    . $this->hiddenIds($householdId, $row['id'])
                    . '<label>Move inside<select name="parentId"><option value="">Top level</option>'
                    . $this->locationOptions($rows, $row['parentId'], $row['id'])
                    . '</select></label><button type="submit">Move</button></form>';
            }
            $content .= '</section>';
        }
        if ($rows === []) {
            $content .= '<section><p class="muted">No places yet.</p></section>';
        }
        $content .= '</div>';

        return $this->page($content, $token);
    }

    public function create(Request $request): Response
    {
        return $this->mutate($request, fn (string $userId, string $householdId): array =>
            $this->locations->createLocation(
                $userId,
                $householdId,
                $request->bodyParam('name') ?? '',
                $this->nullable($request->bodyParam('parentId')),
            ),
        );
    }

    public function rename(Request $request): Response
    {
        return $this->mutate($request, fn (string $userId, string $householdId): array =>
            $this->locations->renameLocation(
                $userId,
                $householdId,
                $request->bodyParam('locationId') ?? '',
                $request->bodyParam('name') ?? '',
            ),
        );
    }

    public function reparent(Request $request): Response
    {
        return $this->mutate($request, fn (string $userId, string $householdId): array =>
            $this->locations->moveLocation(
                $userId,
                $householdId,
                $request->bodyParam('locationId') ?? '',
                $this->nullable($request->bodyParam('parentId')),
            ),
        );
    }

    /** @param callable(string, string): array $operation */
    private function mutate(Request $request, callable $operation): Response
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->signInRedirect();
        }
        if (!$this->csrf->validate(
            $request->cookie('putaway_csrf'),
            $request->bodyParam('_csrf'),
        )) {
            return Response::html(layout('Places', '<p class="notice error">Invalid form token.</p>', true), 403);
        }

        $householdId = $request->bodyParam('householdId') ?? '';
        $result = $operation($userId, $householdId);
        if (($result['ok'] ?? false) !== true) {
            $messages = [
                'forbidden' => 'Only household owners can change places.',
                'archived' => 'That place is archived.',
                'duplicate_name' => 'A place with that name already exists there.',
                'invalid_parent' => 'That destination is not valid.',
            ];
            $code = (string) ($result['code'] ?? 'invalid_parent');
            return Response::html(
                layout('Places', '<p class="notice error">' . escape($messages[$code] ?? 'Could not save.') . '</p>', true),
                $code === 'forbidden' ? 403 : 400,
            );
        }

        return new Response(303, '', [
            'Location' => '/places?household=' . rawurlencode($householdId),
        ]);
    }

    /** @param list<array{householdId: string, name: string, role: string}> $households */
    private function selectedHousehold(array $households, ?string $requested): ?array
    {
        foreach ($households as $household) {
            if ($requested !== null && $household['householdId'] === $requested) {
                return $household;
            }
        }
        return $households[0] ?? null;
    }

    /** @param list<array{householdId: string, name: string, role: string}> $households */
    private function householdPicker(array $households, ?string $selected): string
    {
        if ($households === []) {
            return '';
        }
        $options = '';
        foreach ($households as $household) {
            $isSelected = $household['householdId'] === $selected ? ' selected' : '';
            $options .= '<option value="' . escape($household['householdId']) . '"' . $isSelected . '>'
                . escape($household['name']) . '</option>';
        }
        return '<section><form method="get" action="/places"><label>Household<select name="household">'
            . $options . '</select></label><button type="submit">Switch</button></form></section>';
    }

    /**
     * @param list<array{id: string, parentId: string|null, name: string, pathLabel: string}> $rows
     */
    private function locationOptions(array $rows, ?string $selected = null, ?string $excluded = null): string
    {
        $options = '';
        foreach ($rows as $row) {
            if ($row['id'] === $excluded) {
                continue;
            }
            $isSelected = $row['id'] === $selected ? ' selected' : '';
            $options .= '<option value="' . escape($row['id']) . '"' . $isSelected . '>'
                . escape($row['pathLabel']) . '</option>';
        }
        return $options;
    }

    private function hiddenIds(string $householdId, string $locationId): string
    {
        return '<input type="hidden" name="householdId" value="' . $householdId . '">'
            . '<input type="hidden" name="locationId" value="' . escape($locationId) . '">';
    }

    private function nullable(?string $value): ?string
    {
        return $value === null || $value === '' ? null : $value;
    }

    private function userId(Request $request): ?string
    {
        return $this->auth->userIdForCookie($request->cookie('putaway_session'));
    }

    private function signInRedirect(): Response
    {
        return new Response(302, '', ['Location' => '/sign-in']);
    }

    private function page(string $content, string $token): Response
    {
        return new Response(200, layout('Places', $content, true), [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Set-Cookie' => csrfCookie($token),
        ]);
    }
}
