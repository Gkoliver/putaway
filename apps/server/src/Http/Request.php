<?php
declare(strict_types=1);

namespace Putaway\Http;

final class Request
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        private array $headers = [],
        private string $body = '',
    ) {}

    public static function fromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (!is_string($value) || !str_starts_with($key, 'HTTP_')) {
                continue;
            }
            $name = str_replace('_', '-', substr($key, 5));
            $headers[$name] = $value;
        }

        if (isset($_SERVER['CONTENT_TYPE']) && is_string($_SERVER['CONTENT_TYPE'])) {
            $headers['CONTENT-TYPE'] = $_SERVER['CONTENT_TYPE'];
        }

        $body = file_get_contents('php://input') ?: '';

        return new self($method, $path, $headers, $body);
    }

    public static function fake(string $method, string $path, array $headers = [], string $body = ''): self
    {
        return new self($method, $path, $headers, $body);
    }

    public function header(string $name): ?string
    {
        $normalized = strtoupper(str_replace('-', '_', $name));

        foreach ($this->headers as $headerName => $value) {
            if (strtoupper(str_replace('-', '_', $headerName)) === $normalized) {
                return $value;
            }
        }

        return null;
    }

    public function bearerToken(): ?string
    {
        $authorization = $this->header('Authorization');
        if ($authorization === null) {
            return null;
        }

        if (preg_match('/^Bearer\s+(\S+)$/i', $authorization, $matches) !== 1) {
            return null;
        }

        return $matches[1];
    }

    /** @return array<string, mixed> */
    public function json(): array
    {
        if ($this->body === '') {
            return [];
        }

        $decoded = json_decode($this->body, true);
        return is_array($decoded) ? $decoded : [];
    }

    public function bodyParam(string $name): ?string
    {
        parse_str($this->body, $params);
        if (!is_array($params) || !array_key_exists($name, $params)) {
            return null;
        }

        $value = $params[$name];
        return is_scalar($value) ? (string) $value : null;
    }
}
