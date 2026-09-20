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
        private array $query = [],
        private array $form = [],
        private array $files = [],
    ) {}

    public static function fromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?? '/';
        parse_str((string) parse_url($uri, PHP_URL_QUERY), $query);
        $headers = self::headersFromServer($_SERVER);
        $body = file_get_contents('php://input') ?: '';

        return new self(
            $method,
            $path,
            $headers,
            $body,
            is_array($query) ? $query : [],
            is_array($_POST) ? $_POST : [],
            is_array($_FILES) ? $_FILES : [],
        );
    }

    /**
     * @param array<string, mixed> $server
     * @return array<string, string>
     */
    public static function headersFromServer(array $server): array
    {
        $headers = [];

        if (function_exists('apache_request_headers')) {
            $apacheHeaders = apache_request_headers();
            if (is_array($apacheHeaders)) {
                foreach ($apacheHeaders as $name => $value) {
                    if (is_string($name) && is_string($value)) {
                        $headers[$name] = $value;
                    }
                }
            }
        }

        foreach ($server as $key => $value) {
            if (!is_string($key) || !is_string($value) || !str_starts_with($key, 'HTTP_')) {
                continue;
            }
            $name = str_replace('_', '-', substr($key, 5));
            $headers[$name] = $value;
        }

        if (isset($server['CONTENT_TYPE']) && is_string($server['CONTENT_TYPE'])) {
            $headers['CONTENT-TYPE'] = $server['CONTENT_TYPE'];
        }

        if (self::headerValue($headers, 'Authorization') === null) {
            foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $serverKey) {
                if (!isset($server[$serverKey]) || !is_string($server[$serverKey]) || $server[$serverKey] === '') {
                    continue;
                }
                $headers['Authorization'] = $server[$serverKey];
                break;
            }
        }

        return $headers;
    }

    /**
     * @param array<string, string> $headers
     */
    private static function headerValue(array $headers, string $name): ?string
    {
        $normalized = strtoupper(str_replace('-', '_', $name));

        foreach ($headers as $headerName => $value) {
            if (strtoupper(str_replace('-', '_', $headerName)) === $normalized) {
                return $value;
            }
        }

        return null;
    }

    public static function fake(
        string $method,
        string $path,
        array $headers = [],
        string $body = '',
        array $form = [],
        array $files = [],
    ): self {
        $requestPath = parse_url($path, PHP_URL_PATH) ?? $path;
        parse_str((string) parse_url($path, PHP_URL_QUERY), $query);
        return new self(
            $method,
            $requestPath,
            $headers,
            $body,
            is_array($query) ? $query : [],
            $form,
            $files,
        );
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
        if (array_key_exists($name, $this->form)) {
            $value = $this->form[$name];
            return is_scalar($value) ? (string) $value : null;
        }
        parse_str($this->body, $params);
        if (!is_array($params) || !array_key_exists($name, $params)) {
            return null;
        }

        $value = $params[$name];
        return is_scalar($value) ? (string) $value : null;
    }

    /** @return array{tmp_name: string, name: string, type: string, error: int, size: int}|null */
    public function uploadedFile(string $name): ?array
    {
        $file = $this->files[$name] ?? null;
        if (
            !is_array($file)
            || !is_string($file['tmp_name'] ?? null)
            || !is_string($file['name'] ?? null)
            || !is_string($file['type'] ?? null)
            || !is_int($file['error'] ?? null)
            || !is_int($file['size'] ?? null)
        ) {
            return null;
        }
        return [
            'tmp_name' => $file['tmp_name'],
            'name' => $file['name'],
            'type' => $file['type'],
            'error' => $file['error'],
            'size' => $file['size'],
        ];
    }

    public function queryParam(string $name): ?string
    {
        if (!array_key_exists($name, $this->query)) {
            return null;
        }

        $value = $this->query[$name];
        return is_scalar($value) ? (string) $value : null;
    }
}
