<?php
declare(strict_types=1);

namespace Putaway;

use Putaway\Http\Request;
use Putaway\Http\Response;

final class Router
{
    /** @var list<array{method: string, pattern: string, regex: string, paramNames: list<string>, handler: callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        [$regex, $paramNames] = $this->compilePattern($pattern);

        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'regex' => $regex,
            'paramNames' => $paramNames,
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): Response
    {
        foreach ($this->routes as $route) {
            if ($route['method'] !== strtoupper($request->method)) {
                continue;
            }

            if (preg_match($route['regex'], $request->path, $matches) !== 1) {
                continue;
            }

            $params = [];
            foreach ($route['paramNames'] as $name) {
                $params[$name] = $matches[$name];
            }

            $response = ($route['handler'])($request, $params);
            if (!$response instanceof Response) {
                throw new \RuntimeException('Route handler must return a Response');
            }

            return $response;
        }

        return Response::json(['error' => 'not_found'], 404);
    }

    /** @return array{0: string, 1: list<string>} */
    private function compilePattern(string $pattern): array
    {
        $paramNames = [];
        $regex = preg_replace_callback(
            '/\{([^}]+)\}/',
            static function (array $matches) use (&$paramNames): string {
                $paramNames[] = $matches[1];
                return '(?P<' . $matches[1] . '>[^/]+)';
            },
            $pattern,
        );

        return ['#^' . $regex . '$#', $paramNames];
    }
}
