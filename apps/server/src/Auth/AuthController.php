<?php
declare(strict_types=1);

namespace Putaway\Auth;

use InvalidArgumentException;
use Putaway\Http\Request;
use Putaway\Http\Response;
use RuntimeException;
use Throwable;

final class AuthController
{
    public function __construct(private readonly AuthService $auth)
    {
    }

    public function requestMagicLink(Request $request): Response
    {
        $email = $request->json()['email'] ?? $request->bodyParam('email');
        if (!is_string($email)) {
            return Response::json(['error' => 'invalid_email'], 400);
        }

        try {
            $this->auth->requestMagicLink($email);
            return Response::json(['ok' => true], 201);
        } catch (RateLimitExceeded) {
            return Response::json(['error' => 'rate_limited'], 429);
        } catch (InvalidArgumentException) {
            return Response::json(['error' => 'invalid_email'], 400);
        } catch (Throwable) {
            return Response::json(['error' => 'mail_failed'], 502);
        }
    }

    public function verifyApi(Request $request): Response
    {
        try {
            $session = $this->auth->consumeMagicLink($request->queryParam('token') ?? '');
            $user = $this->auth->userById($session['userId']);
            if ($user === null) {
                throw new RuntimeException('User not found');
            }

            return Response::json([
                'token' => $session['sessionToken'],
                'user' => $user,
            ]);
        } catch (RuntimeException) {
            return Response::json(['error' => 'invalid_or_expired_token'], 400);
        }
    }

    public function verifyWeb(Request $request): Response
    {
        try {
            $session = $this->auth->consumeMagicLink($request->queryParam('token') ?? '');
            $cookie = 'putaway_session=' . rawurlencode($session['sessionToken'])
                . '; Path=/; HttpOnly; Secure; SameSite=Lax';

            return new Response(302, '', [
                'Location' => '/inventory',
                'Set-Cookie' => $cookie,
            ]);
        } catch (RuntimeException) {
            return Response::json(['error' => 'invalid_or_expired_token'], 400);
        }
    }

    public function signOut(Request $request): Response
    {
        $token = $request->bearerToken();
        if ($token === null || $this->auth->userIdForBearer($token) === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        $this->auth->revokeSession($token);
        return new Response(204, '');
    }

    public function me(Request $request): Response
    {
        $user = $this->auth->userForBearer($request->bearerToken());
        if ($user === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        return Response::json(['user' => $user]);
    }
}
