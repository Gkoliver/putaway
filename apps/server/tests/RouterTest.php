<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class RouterTest extends TestCase
{
    public function test_matches_path_params(): void
    {
        $router = new \Putaway\Router();
        $router->add('GET', '/api/households/{householdId}/inventory', function ($req, $params) {
            return \Putaway\Http\Response::json(['id' => $params['householdId']]);
        });
        $req = \Putaway\Http\Request::fake('GET', '/api/households/abc/inventory');
        $res = $router->dispatch($req);
        $this->assertSame(200, $res->status);
        $this->assertSame(['id' => 'abc'], json_decode($res->body, true));
    }
}
