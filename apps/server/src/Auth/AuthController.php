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

            $response = Response::json([
                'token' => $session['sessionToken'],
                'user' => $user,
            ]);
            return $this->noStore($response);
        } catch (RuntimeException) {
            return $this->noStore(
                Response::json(['error' => 'invalid_or_expired_token'], 400),
            );
        }
    }

    public function verifyWeb(Request $request): Response
    {
        $token = $request->queryParam('token') ?? '';
        if ($token === '') {
            return $this->noStore(
                Response::html('<!doctype html><html lang="en"><body><h1>Invalid magic link</h1></body></html>', 400),
            );
        }

        $escapedToken = htmlspecialchars($token, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $deepLink = 'putaway://auth/verify?token=' . rawurlencode($token);
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<title>Continue to Putaway</title></head><body>'
            . '<main><h1>Continue to Putaway</h1>'
            . '<form method="post" action="/auth/verify">'
            . '<input type="hidden" name="token" value="' . $escapedToken . '">'
            . '<button type="submit">Continue on web</button></form>'
            . '<p><a href="' . htmlspecialchars($deepLink, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            . '">Open in Putaway app</a></p>'
            . '<p>Token: <code>' . $escapedToken . '</code></p>'
            . '</main></body></html>';

        return $this->noStore(Response::html($html));
    }

    public function consumeWeb(Request $request): Response
    {
        try {
            $session = $this->auth->consumeMagicLink($request->bodyParam('token') ?? '');
            $cookie = 'putaway_session=' . rawurlencode($session['sessionToken'])
                . '; Path=/; HttpOnly; Secure; SameSite=Lax';

            return new Response(302, '', [
                'Location' => '/inventory',
                'Set-Cookie' => $cookie,
                'Cache-Control' => 'no-store',
            ]);
        } catch (RuntimeException) {
            return $this->noStore(
                Response::json(['error' => 'invalid_or_expired_token'], 400),
            );
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

    public function signOutWeb(Request $request): Response
    {
        $token = $request->cookie('putaway_session');
        if ($token !== null && $token !== '') {
            $this->auth->revokeSession($token);
        }

        return new Response(303, '', [
            'Location' => '/sign-in',
            'Set-Cookie' => 'putaway_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
            'Cache-Control' => 'no-store',
        ]);
    }

    public function me(Request $request): Response
    {
        $user = $this->auth->userForBearer($request->bearerToken());
        if ($user === null) {
            return Response::json(['error' => 'unauthorized'], 401);
        }

        return Response::json(['user' => $user]);
    }

    private function noStore(Response $response): Response
    {
        return new Response(
            $response->status,
            $response->body,
            $response->headers + ['Cache-Control' => 'no-store'],
        );
    }
}
