<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use Putaway\Auth\AuthController;
use Putaway\Auth\AuthService;
use Putaway\Auth\PhpMailMailer;
use Putaway\Db;
use Putaway\Households\HouseholdController;
use Putaway\Households\HouseholdService;
use Putaway\Http\Request;
use Putaway\Inventory\InventoryController;
use Putaway\Inventory\InventoryService;
use Putaway\Inventory\LocationController;
use Putaway\Inventory\LocationService;
use Putaway\Router;

$router = new Router();
$config = require __DIR__ . '/../config/config.php';
$authService = new AuthService(
    Db::pdo(),
    new PhpMailMailer(),
    $config['app_url'],
    $config['mail_from'],
    $config['session_ttl_seconds'],
);
$auth = new AuthController($authService);
$householdService = new HouseholdService(Db::pdo());
$households = new HouseholdController($householdService, $authService);
$locationService = new LocationService(Db::pdo(), $householdService);
$locations = new LocationController(
    $locationService,
    $authService,
);
$inventory = new InventoryController(
    new InventoryService(Db::pdo(), $householdService, $locationService),
    $authService,
);

$router->add('POST', '/api/auth/magic-link', fn (Request $request) => $auth->requestMagicLink($request));
$router->add('GET', '/api/auth/verify', fn (Request $request) => $auth->verifyApi($request));
$router->add('GET', '/auth/verify', fn (Request $request) => $auth->verifyWeb($request));
$router->add('POST', '/api/auth/sign-out', fn (Request $request) => $auth->signOut($request));
$router->add('GET', '/api/auth/me', fn (Request $request) => $auth->me($request));
$router->add('GET', '/api/households', fn (Request $request) => $households->listHouseholds($request));
$router->add('POST', '/api/households', fn (Request $request) => $households->createHousehold($request));
$router->add(
    'POST',
    '/api/households/invites',
    fn (Request $request) => $households->createInvite($request),
);
$router->add(
    'POST',
    '/api/households/invites/accept',
    fn (Request $request) => $households->acceptInvite($request),
);
$router->add(
    'GET',
    '/api/households/{householdId}/locations',
    fn (Request $request, array $params) =>
        $locations->listLocations($request, $params['householdId']),
);
$router->add(
    'POST',
    '/api/households/{householdId}/locations',
    fn (Request $request, array $params) =>
        $locations->createLocation($request, $params['householdId']),
);
$router->add(
    'PATCH',
    '/api/households/{householdId}/locations',
    fn (Request $request, array $params) =>
        $locations->updateLocation($request, $params['householdId']),
);
$router->add(
    'GET',
    '/api/households/{householdId}/inventory',
    fn (Request $request, array $params) =>
        $inventory->listInventory($request, $params['householdId']),
);
$router->add(
    'PATCH',
    '/api/households/{householdId}/inventory',
    fn (Request $request, array $params) =>
        $inventory->editInventory($request, $params['householdId']),
);

$request = Request::fromGlobals();
$response = $router->dispatch($request);

http_response_code($response->status);
foreach ($response->headers as $name => $value) {
    header($name . ': ' . $value);
}
echo $response->body;
