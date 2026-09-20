<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use Putaway\Http\Request;
use Putaway\Router;

$router = new Router();

$request = Request::fromGlobals();
$response = $router->dispatch($request);

http_response_code($response->status);
foreach ($response->headers as $name => $value) {
    header($name . ': ' . $value);
}
echo $response->body;
