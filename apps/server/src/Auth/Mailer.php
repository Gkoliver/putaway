<?php
declare(strict_types=1);

namespace Putaway\Auth;

interface Mailer
{
    public function sendMagicLink(string $email, string $url, string $from): void;
}
