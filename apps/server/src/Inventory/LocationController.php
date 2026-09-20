<?php
declare(strict_types=1);

namespace Putaway\Inventory;

use Putaway\Auth\AuthService;
use Putaway\Http\Request;
use Putaway\Http\Response;

final class LocationController
{
    public function __construct(
        private readonly LocationService $locations,
        private readonly AuthService $auth,
    ) {
    }

    public function listLocations(Request $request, string $householdId): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $result = $this->locations->listLocations($userId, $householdId);
        if (($result['ok'] ?? null) === false) {
            return $this->failure((string) $result['code']);
        }
        return Response::json($result);
    }

    public function createLocation(Request $request, string $householdId): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $body = $request->json();
        $name = $body['name'] ?? null;
        $parentId = $body['parentId'] ?? null;
        if (!is_string($name) || ($parentId !== null && !is_string($parentId))) {
            return $this->invalid();
        }

        $result = $this->locations->createLocation(
            $userId,
            $householdId,
            $name,
            $parentId,
        );
        if (!$result['ok']) {
            return $this->failure($result['code']);
        }
        return Response::json($result, 201);
    }

    public function updateLocation(Request $request, string $householdId): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $body = $request->json();
        $locationId = $body['locationId'] ?? null;
        $hasName = array_key_exists('name', $body) && is_string($body['name']);
        $hasParent = array_key_exists('parentId', $body)
            && ($body['parentId'] === null || is_string($body['parentId']));
        if (!is_string($locationId) || (!$hasName && !$hasParent)) {
            return $this->invalid();
        }
        if (array_key_exists('name', $body) && !$hasName) {
            return $this->invalid();
        }
        if (array_key_exists('parentId', $body) && !$hasParent) {
            return $this->invalid();
        }

        if ($hasName) {
            $renamed = $this->locations->renameLocation(
                $userId,
                $householdId,
                $locationId,
                $body['name'],
            );
            if (!$renamed['ok']) {
                return $this->failure($renamed['code']);
            }
        }

        if ($hasParent) {
            $moved = $this->locations->moveLocation(
                $userId,
                $householdId,
                $locationId,
                $body['parentId'],
            );
            if (!$moved['ok']) {
                return $this->failure($moved['code']);
            }
        }

        return Response::json(['ok' => true]);
    }

    private function invalid(): Response
    {
        return Response::json(['error' => 'invalid', 'spoken' => 'Could not save.'], 400);
    }

    private function failure(string $code): Response
    {
        $spoken = match ($code) {
            'forbidden' => 'You cannot edit places.',
            'archived' => 'That place is archived.',
            'duplicate_name' => 'A place with that name already exists there.',
            'invalid_parent' => 'That parent place is not valid.',
            default => 'Could not save.',
        };
        $status = match ($code) {
            'forbidden' => 403,
            'duplicate_name' => 409,
            default => 400,
        };
        return Response::json(['error' => $code, 'spoken' => $spoken], $status);
    }
}
