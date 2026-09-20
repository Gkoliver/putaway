<?php
declare(strict_types=1);

namespace Putaway\Auth;

final class NullMailer implements Mailer
{
    public ?string $lastEmail = null;
    public ?string $lastUrl = null;
    public ?string $lastFrom = null;

    public function sendMagicLink(string $email, string $url, string $from): void
    {
        $this->lastEmail = $email;
        $this->lastUrl = $url;
        $this->lastFrom = $from;
    }
}
