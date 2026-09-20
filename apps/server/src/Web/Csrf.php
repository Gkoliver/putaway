<?php
declare(strict_types=1);

namespace Putaway\Web;

final class Csrf
{
    public function generate(): string
    {
        return bin2hex(random_bytes(32));
    }

    public function validate(?string $cookieToken, ?string $formToken): bool
    {
        return $cookieToken !== null
            && $cookieToken !== ''
            && $formToken !== null
            && hash_equals($cookieToken, $formToken);
    }
}
