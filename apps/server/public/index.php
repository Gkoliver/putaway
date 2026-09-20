<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use Putaway\Auth\AuthController;
use Putaway\Auth\AuthService;
use Putaway\Auth\PhpMailMailer;
use Putaway\Db;
use Putaway\Http\Request;
use Putaway\Router;

$router = new Router();
$config = require __DIR__ . '/../config/config.php';
$auth = new AuthController(new AuthService(
    Db::pdo(),
    new PhpMailMailer(),
    $config['app_url'],
    $config['mail_from'],
    $config['session_ttl_seconds'],
));

$router->add('POST', '/api/auth/magic-link', fn (Request $request) => $auth->requestMagicLink($request));
$router->add('GET', '/api/auth/verify', fn (Request $request) => $auth->verifyApi($request));
$router->add('GET', '/auth/verify', fn (Request $request) => $auth->verifyWeb($request));
$router->add('POST', '/api/auth/sign-out', fn (Request $request) => $auth->signOut($request));
$router->add('GET', '/api/auth/me', fn (Request $request) => $auth->me($request));

$request = Request::fromGlobals();
$response = $router->dispatch($request);

http_response_code($response->status);
foreach ($response->headers as $name => $value) {
    header($name . ': ' . $value);
}
echo $response->body;
