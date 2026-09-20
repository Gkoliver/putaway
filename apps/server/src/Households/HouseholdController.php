<?php
declare(strict_types=1);

namespace Putaway\Households;

use InvalidArgumentException;
use Putaway\Auth\AuthService;
use Putaway\Http\Request;
use Putaway\Http\Response;
use RuntimeException;

final class HouseholdController
{
    public function __construct(
        private readonly HouseholdService $households,
        private readonly AuthService $auth,
    ) {
    }

    public function listHouseholds(Request $request): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        return Response::json($this->households->listHouseholds($userId));
    }

    public function createHousehold(Request $request): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $name = $request->json()['name'] ?? null;
        if (!is_string($name)) {
            return Response::json(['error' => 'invalid_name'], 400);
        }

        try {
            return Response::json($this->households->createHousehold($userId, $name), 201);
        } catch (InvalidArgumentException) {
            return Response::json(['error' => 'invalid_name'], 400);
        }
    }

    public function createInvite(Request $request): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $body = $request->json();
        $householdId = $body['householdId'] ?? null;
        $email = $body['email'] ?? null;
        $role = $body['role'] ?? null;
        if (!is_string($householdId) || !is_string($email)) {
            return Response::json(['error' => 'invalid_invite'], 400);
        }
        if ($role !== 'owner' && $role !== 'member') {
            return Response::json(['error' => 'invalid_role'], 400);
        }

        try {
            $invite = $this->households->createInvite($householdId, $email, $role, $userId);
            return Response::json($invite, 201);
        } catch (InvalidArgumentException) {
            return Response::json(['error' => 'invalid_invite'], 400);
        } catch (RuntimeException $error) {
            if ($error->getMessage() === 'only owners can create invites') {
                return Response::json(['error' => 'forbidden'], 403);
            }
            throw $error;
        }
    }

    public function acceptInvite(Request $request): Response
    {
        $user = $this->auth->userForBearer($request->bearerToken());
        if ($user === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $token = $request->json()['token'] ?? null;
        if (!is_string($token) || $token === '') {
            return Response::json(['error' => 'not_found'], 400);
        }

        $result = $this->households->acceptInvite($token, $user['id'], $user['email']);
        return Response::json($result, array_key_exists('error', $result) ? 400 : 200);
    }
}
