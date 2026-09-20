<?php
declare(strict_types=1);

namespace Putaway\Web;

require_once __DIR__ . '/layout.php';

use Putaway\Auth\AuthService;
use Putaway\Households\HouseholdService;
use Putaway\Http\Request;
use Putaway\Http\Response;
use Putaway\Inventory\InventoryService;

final class InventoryPage
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly HouseholdService $households,
        private readonly InventoryService $inventory,
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
        $search = trim($request->queryParam('q') ?? '');

        $content = $this->householdPicker($households, $selected['householdId'] ?? null, '/inventory');
        if ($selected === null) {
            $content .= '<section><p>You do not belong to a household yet.</p></section>';
            return $this->page($content, $token);
        }

        $rows = $this->inventory->listInventory($userId, $selected['householdId']);
        if (isset($rows['ok']) && $rows['ok'] === false) {
            return Response::html(layout('Inventory', '<p class="notice error">Access denied.</p>', true), 403);
        }
        if ($search !== '') {
            $rows = array_values(array_filter(
                $rows,
                static fn (array $row): bool =>
                    stripos($row['itemName'], $search) !== false
                    || stripos($row['pathLabel'], $search) !== false,
            ));
        }

        $householdId = escape($selected['householdId']);
        $content .= '<section><form method="get" action="/inventory">'
            . '<input type="hidden" name="household" value="' . $householdId . '">'
            . '<label>Search<input name="q" value="' . escape($search)
            . '" placeholder="Item or place"></label><button type="submit">Search</button></form></section>';
        $content .= '<div class="grid">';
        foreach ($rows as $row) {
            $content .= '<section class="card"><form method="post" action="/inventory/edit">'
                . csrfInput($token)
                . '<input type="hidden" name="householdId" value="' . $householdId . '">'
                . '<input type="hidden" name="itemId" value="' . escape($row['itemId']) . '">'
                . '<input type="hidden" name="locationId" value="' . escape($row['locationId']) . '">'
                . '<label>Item<input name="name" required value="' . escape($row['itemName']) . '"></label>'
                . '<label>Quantity<input name="quantity" type="number" min="0" required value="'
                . escape((string) $row['quantity']) . '"></label>'
                . '<label>Place path<input name="locationPath" required value="'
                . escape($row['pathLabel']) . '"></label>'
                . '<button type="submit">Save</button></form></section>';
        }
        if ($rows === []) {
            $content .= '<section><p class="muted">No inventory matches.</p></section>';
        }
        $content .= '</div>';

        return $this->page($content, $token);
    }

    public function edit(Request $request): Response
    {
        $userId = $this->userId($request);
        if ($userId === null) {
            return $this->signInRedirect();
        }
        if (!$this->csrf->validate(
            $request->cookie('putaway_csrf'),
            $request->bodyParam('_csrf'),
        )) {
            return Response::html(layout('Inventory', '<p class="notice error">Invalid form token.</p>', true), 403);
        }

        $householdId = $request->bodyParam('householdId') ?? '';
        $quantity = filter_var($request->bodyParam('quantity'), FILTER_VALIDATE_INT);
        $path = preg_split('/\s*(?:→|>)\s*/u', $request->bodyParam('locationPath') ?? '') ?: [];
        if ($quantity === false) {
            return Response::html(layout('Inventory', '<p class="notice error">Invalid quantity.</p>', true), 400);
        }

        $result = $this->inventory->editLot(
            $userId,
            $householdId,
            $request->bodyParam('itemId') ?? '',
            $request->bodyParam('locationId') ?? '',
            $request->bodyParam('name') ?? '',
            $quantity,
            $path,
        );
        if (($result['ok'] ?? false) !== true) {
            $status = $result['code'] === 'forbidden' ? 403 : 400;
            return Response::html(
                layout('Inventory', '<p class="notice error">' . escape($result['spoken']) . '</p>', true),
                $status,
            );
        }

        return new Response(303, '', [
            'Location' => '/inventory?household=' . rawurlencode($householdId),
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
    private function householdPicker(array $households, ?string $selected, string $action): string
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
        return '<section><form method="get" action="' . $action . '"><label>Household<select name="household">'
            . $options . '</select></label><button type="submit">Switch</button></form></section>';
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
        return new Response(200, layout('Inventory', $content, true), [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Set-Cookie' => csrfCookie($token),
        ]);
    }
}
