<?php
declare(strict_types=1);

namespace Putaway\Inventory;

use Putaway\Auth\AuthService;
use Putaway\Http\Request;
use Putaway\Http\Response;

final class InventoryController
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly AuthService $auth,
    ) {
    }

    public function listInventory(Request $request, string $householdId): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $result = $this->inventory->listInventory($userId, $householdId);
        if (($result['ok'] ?? null) === false) {
            return Response::json(['error' => 'forbidden'], 403);
        }
        return Response::json($result);
    }

    public function editInventory(Request $request, string $householdId): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $body = $request->json();
        $itemId = $body['itemId'] ?? null;
        $locationId = $body['locationId'] ?? null;
        $name = $body['name'] ?? null;
        $quantity = $body['quantity'] ?? null;
        $rawLocationPath = $body['locationPath'] ?? null;
        if (
            !is_string($itemId)
            || !is_string($locationId)
            || !is_string($name)
            || !is_int($quantity)
            || !is_array($rawLocationPath)
        ) {
            return $this->invalid();
        }

        $locationPath = [];
        foreach ($rawLocationPath as $segment) {
            if (!is_string($segment)) {
                return $this->invalid();
            }
            $locationPath[] = $segment;
        }

        $result = $this->inventory->editLot(
            $userId,
            $householdId,
            $itemId,
            $locationId,
            $name,
            $quantity,
            $locationPath,
        );
        if (!$result['ok']) {
            $status = match ($result['code']) {
                'forbidden' => 403,
                'unknown_item' => 404,
                'duplicate_name' => 409,
                default => 400,
            };
            return Response::json([
                'error' => $result['code'],
                'spoken' => $result['spoken'],
            ], $status);
        }
        return Response::json($result);
    }

    private function invalid(): Response
    {
        return Response::json(['error' => 'invalid', 'spoken' => 'Could not save.'], 400);
    }
}
