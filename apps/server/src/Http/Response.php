<?php
declare(strict_types=1);

namespace Putaway\Http;

final class Response
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly int $status,
        public readonly string $body,
        public readonly array $headers = [],
    ) {}

    public static function json(mixed $data, int $status = 200): self
    {
        return new self(
            $status,
            json_encode($data, JSON_THROW_ON_ERROR),
            ['Content-Type' => 'application/json'],
        );
    }

    public static function html(string $html, int $status = 200): self
    {
        return new self(
            $status,
            $html,
            ['Content-Type' => 'text/html; charset=UTF-8'],
        );
    }
}
