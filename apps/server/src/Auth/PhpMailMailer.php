<?php
declare(strict_types=1);

namespace Putaway\Auth;

use RuntimeException;

final class PhpMailMailer implements Mailer
{
    public function sendMagicLink(string $email, string $url, string $from): void
    {
        $subject = 'Your Putaway sign-in link';
        $message = "Use this one-time link to sign in to Putaway:\n\n{$url}\n\n"
            . "This link expires in 15 minutes.";
        $headers = [
            'From: ' . $from,
            'Content-Type: text/plain; charset=UTF-8',
        ];

        if (!mail($email, $subject, $message, implode("\r\n", $headers))) {
            throw new RuntimeException('Unable to send magic link');
        }
    }
}
