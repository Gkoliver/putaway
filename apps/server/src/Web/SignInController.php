<?php
declare(strict_types=1);

namespace Putaway\Web;

require_once __DIR__ . '/layout.php';

use InvalidArgumentException;
use Putaway\Auth\AuthService;
use Putaway\Auth\RateLimitExceeded;
use Putaway\Http\Request;
use Putaway\Http\Response;
use Throwable;

final class SignInController
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly Csrf $csrf,
    ) {
    }

    public function show(Request $request): Response
    {
        if ($this->auth->userIdForCookie($request->cookie('putaway_session')) !== null) {
            return new Response(302, '', ['Location' => '/inventory']);
        }

        $token = $request->cookie('putaway_csrf') ?? $this->csrf->generate();
        return $this->page($token);
    }

    public function submit(Request $request): Response
    {
        $token = $request->cookie('putaway_csrf');
        if (!$this->csrf->validate($token, $request->bodyParam('_csrf'))) {
            return $this->page($token ?? $this->csrf->generate(), 'Your form expired. Try again.', 403);
        }

        try {
            $this->auth->requestMagicLink($request->bodyParam('email') ?? '');
            $content = '<section><p class="notice">Check your email for your sign-in link.</p>'
                . '<p class="muted">You can close this page after the link arrives.</p></section>';
            return Response::html(layout('Check your email', $content));
        } catch (InvalidArgumentException) {
            return $this->page($token, 'Enter a valid email address.', 400);
        } catch (RateLimitExceeded) {
            return $this->page($token, 'Too many attempts. Try again later.', 429);
        } catch (Throwable) {
            return $this->page($token, 'We could not send the email. Try again.', 502);
        }
    }

    private function page(string $token, ?string $error = null, int $status = 200): Response
    {
        $message = $error === null ? '' : '<p class="notice error">' . escape($error) . '</p>';
        $content = '<section>' . $message
            . '<p>Enter your email and we’ll send you a secure sign-in link.</p>'
            . '<form method="post" action="/sign-in">' . csrfInput($token)
            . '<label>Email<input name="email" type="email" autocomplete="email" required></label>'
            . '<button type="submit">Send sign-in link</button></form></section>';

        return new Response(
            $status,
            layout('Sign in', $content),
            [
                'Content-Type' => 'text/html; charset=UTF-8',
                'Set-Cookie' => csrfCookie($token),
            ],
        );
    }
}
